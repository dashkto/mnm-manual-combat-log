#!/usr/bin/env python3
"""Summarize and compare M&M combat log CSVs.

  analyze.py                          summarize every CSV in data/
  analyze.py a.csv b.csv              summarize specific files
  analyze.py --compare base dex+10    compare two setup labels
  analyze.py --mob "a cinder worker" --mob-level 17 --compare base dex+10
"""
import argparse
import csv
import glob
import math
import os
import statistics
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DEDUP_KEY = ("session_id", "ts", "fight", "actor", "kind", "hand", "result", "damage")


def load(paths):
    files = []
    for p in paths or [os.path.join(HERE, "data")]:
        files += sorted(glob.glob(os.path.join(p, "*.csv"))) if os.path.isdir(p) else [p]
    rows, seen = [], set()
    for f in files:
        with open(f, newline="", encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                k = tuple(r.get(c, "") for c in DEDUP_KEY)
                if k not in seen:
                    seen.add(k)
                    rows.append(r)
    return files, rows


def wilson(k, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    w = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return (c - w) / d, (c + w) / d


def side(rows):
    n = len(rows)
    hits = [r for r in rows if r["result"] == "hit"]
    dmg = [float(r["damage"]) for r in hits]
    out = {"n": n, "hits": len(hits), "dmg": dmg}
    for res in ("miss", "dodge", "parry", "block"):
        out[res] = sum(r["result"] == res for r in rows)
    out["crits"] = sum(r.get("crit") == "1" for r in hits)
    return out


def mean_ci(xs):
    if not xs:
        return 0.0, 0.0
    m = statistics.fmean(xs)
    return m, (1.96 * statistics.stdev(xs) / math.sqrt(len(xs))) if len(xs) > 1 else 0.0


def pval(z):
    return math.erfc(abs(z) / math.sqrt(2))


def fmt_rate(s):
    if not s["n"]:
        return "-"
    lo, hi = wilson(s["hits"], s["n"])
    return f"{100 * s['hits'] / s['n']:5.1f}% [{100 * lo:.0f}-{100 * hi:.0f}]"


def fmt_dmg(s):
    if not s["dmg"]:
        return "-"
    m, h = mean_ci(s["dmg"])
    return f"{m:6.1f} +/-{h:.1f}"


def summarize(groups):
    hdr = f"{'setup':<14}{'mob':<26}{'swings':>7}  {'your hit %':<18}{'avg hit':<14}{'mob swings':>10}  {'mob hit %':<18}{'mob avg':<14}"
    print(hdr)
    print("-" * len(hdr))
    for (label, mob, lvl), g in sorted(groups.items()):
        p, m = side(g["player"]), side(g["mob"])
        print(f"{label:<14}{(mob + ' L' + lvl)[:25]:<26}{p['n']:>7}  {fmt_rate(p):<18}{fmt_dmg(p):<14}"
              f"{m['n']:>10}  {fmt_rate(m):<18}{fmt_dmg(m):<14}")


def compare_side(name, a, b):
    print(f"\n{name}")
    if a["n"] and b["n"]:
        pa, pb = a["hits"] / a["n"], b["hits"] / b["n"]
        pool = (a["hits"] + b["hits"]) / (a["n"] + b["n"])
        se_pool = math.sqrt(pool * (1 - pool) * (1 / a["n"] + 1 / b["n"]))
        se = math.sqrt(pa * (1 - pa) / a["n"] + pb * (1 - pb) / b["n"])
        z = (pb - pa) / se_pool if se_pool else 0.0
        print(f"  hit rate   {100 * pa:.1f}% (n={a['n']}) -> {100 * pb:.1f}% (n={b['n']})  "
              f"diff {100 * (pb - pa):+.1f} pts [{100 * (pb - pa - 1.96 * se):+.1f}, {100 * (pb - pa + 1.96 * se):+.1f}]  p={pval(z):.3f}")
        for res in ("miss", "dodge", "parry", "block"):
            if a[res] or b[res]:
                print(f"    {res:<6} {100 * a[res] / a['n']:.1f}% -> {100 * b[res] / b['n']:.1f}%")
    if len(a["dmg"]) > 1 and len(b["dmg"]) > 1:
        ma, mb = statistics.fmean(a["dmg"]), statistics.fmean(b["dmg"])
        se = math.sqrt(statistics.variance(a["dmg"]) / len(a["dmg"]) + statistics.variance(b["dmg"]) / len(b["dmg"]))
        z = (mb - ma) / se if se else 0.0
        print(f"  avg hit    {ma:.1f} (n={len(a['dmg'])}) -> {mb:.1f} (n={len(b['dmg'])})  "
              f"diff {mb - ma:+.1f} [{mb - ma - 1.96 * se:+.1f}, {mb - ma + 1.96 * se:+.1f}]  p={pval(z):.3f}")
        print(f"  median     {statistics.median(a['dmg']):.0f} -> {statistics.median(b['dmg']):.0f}"
              f"   max {max(a['dmg']):.0f} -> {max(b['dmg']):.0f}")
        ea = ma * a["hits"] / a["n"]
        eb = mb * b["hits"] / b["n"]
        print(f"  dmg/swing  {ea:.2f} -> {eb:.2f}  ({100 * (eb / ea - 1):+.1f}%)" if ea else "")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("paths", nargs="*", help="CSV files or folders (default: data/)")
    ap.add_argument("--compare", nargs=2, metavar=("A", "B"), help="two setup labels to compare")
    ap.add_argument("--mob", help="only this mob name")
    ap.add_argument("--mob-level", help="only this mob level")
    ap.add_argument("--contributor", help="only this contributor")
    ap.add_argument("--hand", default="main", choices=["main", "off", "any"])
    ap.add_argument("--include-abilities", action="store_true")
    a = ap.parse_args()

    files, rows = load(a.paths)
    rows = [r for r in rows
            if (a.include_abilities or r["kind"] == "melee")
            and (a.hand == "any" or r["hand"] == a.hand)
            and (not a.mob or r["mob_name"].lower() == a.mob.lower())
            and (not a.mob_level or r["mob_level"] == a.mob_level)
            and (not a.contributor or r["contributor"].lower() == a.contributor.lower())]
    print(f"{len(files)} file(s), {len(rows)} swings after filters\n")
    if not rows:
        return

    groups = defaultdict(lambda: {"player": [], "mob": []})
    for r in rows:
        groups[(r["setup_label"], r["mob_name"], r["mob_level"])][r["actor"]].append(r)
    summarize(groups)

    if a.compare:
        A, B = ({"player": [], "mob": []} for _ in range(2))
        for r in rows:
            for label, bucket in zip(a.compare, (A, B)):
                if r["setup_label"] == label:
                    bucket[r["actor"]].append(r)
        mobs = {(r["mob_name"], r["mob_level"]) for r in rows if r["setup_label"] in a.compare}
        print(f"\n=== {a.compare[0]} -> {a.compare[1]} ===")
        if len(mobs) > 1:
            print(f"warning: mixes {len(mobs)} mob/level combos; use --mob and --mob-level to hold the target fixed")
        compare_side("Your swings", side(A["player"]), side(B["player"]))
        compare_side("Mob swings on you", side(A["mob"]), side(B["mob"]))


if __name__ == "__main__":
    main()
