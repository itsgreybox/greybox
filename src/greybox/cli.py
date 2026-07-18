import argparse
import sys
from .report import generate_report


def main():
    parser = argparse.ArgumentParser(
        prog="greybox",
        description="Point at an undocumented codebase, get a plain-English "
        "assessment: dependency graph, risk flags, and an honest confidence "
        "score per module.",
    )
    parser.add_argument("directory", help="Path to the codebase directory to analyze")
    parser.add_argument(
        "--output", "-o", default="greybox_report.md", help="Where to write the report"
    )
    args = parser.parse_args()

    report = generate_report(args.directory, args.output)
    print(f"Report written to {args.output}\n")
    print(report[:500] + "\n...\n(see full report in the output file)")


if __name__ == "__main__":
    sys.exit(main())
