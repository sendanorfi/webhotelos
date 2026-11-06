"""Validate the members of a WebhotelOS site backup before extraction.

This module does not extract data or restore a site. Callers must also validate
manifest contents, enforce resource limits and write to a fresh private directory.
"""

from pathlib import PurePosixPath
import tarfile


class UnsafeArchive(ValueError):
    """The archive cannot safely be used for a restore."""


def validate_members(archive: tarfile.TarFile) -> list[tarfile.TarInfo]:
    """Reject paths, links and special files outside the backup format."""
    members = archive.getmembers()
    seen: set[str] = set()
    for member in members:
        name = member.name
        path = PurePosixPath(name)
        if (
            not name
            or name.startswith("/")
            or "\\" in name
            or any(part in ("", ".", "..") for part in name.split("/"))
            or path.parts[0] not in ("manifest.json", "database.sql", "uploads")
        ):
            raise UnsafeArchive("invalid member path")
        if name in seen:
            raise UnsafeArchive("duplicate member")
        seen.add(name)
        if not (member.isfile() or member.isdir()):
            raise UnsafeArchive("links and special files are not allowed")
        if path.parts[0] in ("manifest.json", "database.sql") and (
            len(path.parts) != 1 or not member.isfile()
        ):
            raise UnsafeArchive("invalid metadata member")
        if name == "uploads" and not member.isdir():
            raise UnsafeArchive("uploads must be a directory")
    if not {"manifest.json", "database.sql"}.issubset(seen):
        raise UnsafeArchive("missing required member")
    return members
