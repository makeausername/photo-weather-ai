from __future__ import annotations

from pathlib import Path

from skyfield.api import Loader


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
EPHEMERIS_FILE_NAME = "de421.bsp"


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    loader = Loader(str(DATA_DIR))
    path = loader(EPHEMERIS_FILE_NAME)
    print(f"Cached ephemeris: {path}")


if __name__ == "__main__":
    main()
