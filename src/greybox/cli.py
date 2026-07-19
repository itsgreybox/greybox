import argparse
import sys
from .report import generate_report, generate_json


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
    parser.add_argument(
        "--format", choices=["md", "json"], default="md",
        help="Output format. json gives sortable, diffable, structured data - "
             "the thing a chat conversation can't produce.",
    )
    parser.add_argument(
        "--workers", type=int, default=8,
        help="How many files to analyze concurrently (default 8). Higher is "
             "faster but risks hitting API rate limits on very large codebases.",
    )
    args = parser.parse_args()

    if args.format == "json":
        output = args.output if args.output != "greybox_report.md" else "greybox_report.json"
        result = generate_json(args.directory, output)
        print(f"JSON report written to {output}")
        print(f"Modules sorted lowest-confidence-first: "
              f"{[m['module'] + ':' + str(m['confidence']) for m in result['modules']]}")
    else:
        report = generate_report(args.directory, args.output, workers=args.workers)
        print(f"Report written to {args.output}\n")
        print(report[:500] + "\n...\n(see full report in the output file)")


if __name__ == "__main__":
    sys.exit(main())
