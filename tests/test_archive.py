import io
import sys
import tarfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "packages"))
from webhotelos.archive import UnsafeArchive, validate_members


def archive_with(entries):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w") as archive:
        for name, kind in entries:
            member = tarfile.TarInfo(name)
            member.type = kind
            if kind == tarfile.SYMTYPE:
                member.linkname = "../../etc/passwd"
            archive.addfile(member)
    stream.seek(0)
    return tarfile.open(fileobj=stream, mode="r")


BASE = [("manifest.json", tarfile.REGTYPE), ("database.sql", tarfile.REGTYPE)]


class ArchiveValidationTest(unittest.TestCase):
    def test_valid_backup(self):
        with archive_with(BASE + [("uploads", tarfile.DIRTYPE), ("uploads/photo.jpg", tarfile.REGTYPE)]) as archive:
            self.assertEqual(len(validate_members(archive)), 4)

    def test_rejects_unsafe_members(self):
        for name, kind in [
            ("../outside", tarfile.REGTYPE),
            ("/etc/passwd", tarfile.REGTYPE),
            ("uploads/../outside", tarfile.REGTYPE),
            ("uploads/./file", tarfile.REGTYPE),
            ("uploads//file", tarfile.REGTYPE),
            ("uploads\\file", tarfile.REGTYPE),
            ("uploads/link", tarfile.SYMTYPE),
            ("uploads/device", tarfile.CHRTYPE),
            ("database.sql/file", tarfile.REGTYPE),
            ("other", tarfile.REGTYPE),
            ("manifest.json", tarfile.REGTYPE),
        ]:
            with self.subTest(name=name, kind=kind), archive_with(BASE + [(name, kind)]) as archive:
                with self.assertRaises(UnsafeArchive):
                    validate_members(archive)

    def test_requires_metadata_and_database(self):
        with archive_with(BASE[:1]) as archive:
            with self.assertRaises(UnsafeArchive):
                validate_members(archive)


if __name__ == "__main__":
    unittest.main()
