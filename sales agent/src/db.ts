import Database from "better-sqlite3";
import path from "path";
import { Lead } from "./types";

const DB_PATH = path.join(process.cwd(), "leads.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma("journal_mode = WAL");
    migrate(_db);
  }
  return _db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      businessName TEXT NOT NULL,
      industry TEXT NOT NULL,
      location TEXT NOT NULL,
      hasWebsite INTEGER NOT NULL DEFAULT 0,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      siteUrl TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      sequenceStep INTEGER NOT NULL DEFAULT 0,
      nextFollowUpAt TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS outreach_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      leadId INTEGER NOT NULL,
      sequenceStep INTEGER NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      sentAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (leadId) REFERENCES leads(id)
    );
  `);
}

export function insertLead(lead: Omit<Lead, "id" | "createdAt" | "updatedAt">): Lead {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO leads (businessName, industry, location, hasWebsite, email, phone, siteUrl, status, sequenceStep, nextFollowUpAt)
    VALUES (@businessName, @industry, @location, @hasWebsite, @email, @phone, @siteUrl, @status, @sequenceStep, @nextFollowUpAt)
  `);
  const result = stmt.run({
    ...lead,
    hasWebsite: lead.hasWebsite ? 1 : 0,
    siteUrl: lead.siteUrl ?? null,
  });
  return getLeadById(result.lastInsertRowid as number)!;
}

export function getLeadById(id: number): Lead | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM leads WHERE id = ?").get(id) as any;
  return row ? rowToLead(row) : null;
}

export function getAllLeads(): Lead[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM leads ORDER BY createdAt DESC").all() as any[];
  return rows.map(rowToLead);
}

export function getLeadsDueForFollowUp(): Lead[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM leads
    WHERE status NOT IN ('converted', 'unsubscribed')
    AND sequenceStep < 3
    AND nextFollowUpAt IS NOT NULL
    AND nextFollowUpAt <= datetime('now')
    ORDER BY nextFollowUpAt ASC
  `).all() as any[];
  return rows.map(rowToLead);
}

export function updateLeadSequence(
  id: number,
  sequenceStep: number,
  nextFollowUpAt: string | null,
  status: Lead["status"]
): void {
  const db = getDb();
  db.prepare(`
    UPDATE leads
    SET sequenceStep = ?, nextFollowUpAt = ?, status = ?, updatedAt = datetime('now')
    WHERE id = ?
  `).run(sequenceStep, nextFollowUpAt, status, id);
}

export function updateLeadStatus(id: number, status: Lead["status"]): void {
  const db = getDb();
  db.prepare(`
    UPDATE leads SET status = ?, updatedAt = datetime('now') WHERE id = ?
  `).run(status, id);
}

export function logOutreach(
  leadId: number,
  sequenceStep: number,
  channel: string,
  body: string,
  subject?: string
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO outreach_log (leadId, sequenceStep, channel, subject, body)
    VALUES (?, ?, ?, ?, ?)
  `).run(leadId, sequenceStep, channel, subject ?? null, body);
}

function rowToLead(row: any): Lead {
  return {
    id: row.id,
    businessName: row.businessName,
    industry: row.industry,
    location: row.location,
    hasWebsite: row.hasWebsite === 1,
    email: row.email,
    phone: row.phone,
    siteUrl: row.siteUrl ?? undefined,
    status: row.status,
    sequenceStep: row.sequenceStep,
    nextFollowUpAt: row.nextFollowUpAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
