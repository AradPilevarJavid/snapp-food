from __future__ import annotations

import argparse
import sys

from sqlalchemy import func, select

from api.config import Settings
from api.database import build_engine, build_session_factory
from api.models import User


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Privileged Snapfood API administration")
    subparsers = parser.add_subparsers(dest="command", required=True)
    bootstrap = subparsers.add_parser(
        "bootstrap-admin",
        help="provision the first administrator by exact OIDC subject",
    )
    bootstrap.add_argument("oidc_subject")
    args = parser.parse_args(argv)

    settings = Settings.from_env()
    settings.validate()
    engine = build_engine(settings)
    try:
        session = build_session_factory(engine)()
        try:
            existing_admins = session.scalar(
                select(func.count()).select_from(User).where(User.role == "admin")
            )
            if existing_admins:
                print("An administrator already exists; use POST /admin/managers for approvals.")
                return 1
            user = session.scalar(select(User).where(User.oidc_subject == args.oidc_subject))
            if user is None:
                user = User(oidc_subject=args.oidc_subject, role="admin")
                session.add(user)
            else:
                user.role = "admin"
            session.commit()
        finally:
            session.close()
    finally:
        engine.dispose()
    print("Administrator provisioned. Verify the OIDC subject out of band.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
