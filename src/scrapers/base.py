from __future__ import annotations

from abc import ABC, abstractmethod

from src.models import Lead


class BaseScraper(ABC):
    @abstractmethod
    async def search(self, query: str, location: str) -> list[Lead]:
        """Search for businesses matching query in location. Return leads without websites."""
        ...
