"""Local-only panel credential initialization and password reset."""

import argparse
import getpass
import os
import sys
from pathlib import Path

from .store import Store


def main():
    parser = argparse.ArgumentParser(prog="webhotelos-admin")
    parser.add_argument("action", choices=("init", "reset-password"))
    parser.add_argument("--password-stdin", action="store_true", help="Read one password line from standard input")
    args = parser.parse_args()
    state = Path(os.environ["WEBHOTELOS_STATE_FILE"])
    store = Store(state)
    username = input("Panel username: ").strip() if args.action == "init" else (store.username() or "")
    if args.password_stdin:
        password = sys.stdin.readline(1026).removesuffix("\n").removesuffix("\r")
    else:
        password = getpass.getpass("Panel password: ")
        if password != getpass.getpass("Confirm panel password: "):
            parser.exit(1, "Passwords do not match.\n")
    try:
        store.set_administrator(username, password, reset=args.action == "reset-password")
    except ValueError as exc:
        parser.exit(1, f"{exc}\n")
    print("Panel credentials updated; existing sessions were revoked.")


if __name__ == "__main__":
    main()
