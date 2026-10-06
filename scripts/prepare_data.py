"""Build a browser-ready, anonymized account extract from the challenge CSVs."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from statistics import median, pstdev


ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUTPUT = ROOT / "src" / "data" / "demo.json"
ANALYSIS_DATE = date(2018, 8, 31)
EXCLUDED_STATUSES = {"canceled", "unavailable"}


def parsed_date(value: str) -> date | None:
    return date.fromisoformat(value[:10]) if value else None


def money(value: float) -> float:
    return round(value + 1e-9, 2)


def load_data(raw: Path = RAW) -> tuple[dict, dict]:
    accounts: dict[str, dict] = {}
    orders: dict[str, dict] = {}
    with (raw / "order_lines.csv").open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            account_id = row["account_id"]
            account = accounts.setdefault(account_id, {
                "id": account_id, "city": row["city"], "state": row["state"],
                "orders": [],
            })
            order_id = row["order_id"]
            if order_id not in orders:
                orders[order_id] = {
                    "id": order_id, "date": parsed_date(row["order_date"]),
                    "status": row["order_status"], "revenue": 0.0,
                    "categories": set(), "delivered": parsed_date(row["delivered_date"]),
                    "estimated": parsed_date(row["estimated_delivery_date"]),
                    "review_score": None, "review_date": None,
                }
                account["orders"].append(orders[order_id])
            order = orders[order_id]
            if row["price"]:
                order["revenue"] += float(row["price"])
            if row["product_category"] and row["product_category"] != "unknown":
                order["categories"].add(row["product_category"])

    with (raw / "order_reviews.csv").open(encoding="utf-8", newline="") as source:
        for row in csv.DictReader(source):
            order = orders.get(row["order_id"])
            if order and row["review_score"]:
                review_date = parsed_date(row["review_answer_timestamp"])
                if review_date and (order["review_date"] is None or review_date >= order["review_date"]):
                    order["review_score"] = int(row["review_score"])
                    order["review_date"] = review_date
    return accounts, orders


def qualifying_orders(account: dict, asof: date) -> list[dict]:
    return sorted((order for order in account["orders"]
                   if order["date"] and order["date"] <= asof
                   and order["status"] not in EXCLUDED_STATUSES),
                  key=lambda order: (order["date"], order["id"]))


def interval_stats(orders: list[dict]) -> tuple[float | None, float | None]:
    dates = sorted({order["date"] for order in orders})
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    if not gaps:
        return None, None
    typical = float(median(gaps))
    mean_gap = sum(gaps) / len(gaps)
    variability = pstdev(gaps) / mean_gap if mean_gap else 0.0
    return typical, variability


def summarize(account: dict, asof: date) -> dict:
    orders = qualifying_orders(account, asof)
    months = {order["date"].strftime("%Y-%m") for order in orders}
    established = len(orders) >= 6 and len(months) >= 3
    typical, variability = interval_stats(orders)
    days_since = (asof - orders[-1]["date"]).days if orders else None
    recent_start = asof - timedelta(days=89)
    baseline_start = asof - timedelta(days=179)
    recent = money(sum(order["revenue"] for order in orders if order["date"] >= recent_start))
    baseline = money(sum(order["revenue"] for order in orders
                         if baseline_start <= order["date"] < recent_start))
    decline = round((baseline - recent) / baseline * 100) if baseline > 0 and recent < baseline else 0

    category_orders: dict[str, list[dict]] = defaultdict(list)
    for order in orders:
        for category in order["categories"]:
            category_orders[category].append(order)
    dropped = []
    for category, history in category_orders.items():
        prior = [order for order in history if order["date"] < recent_start]
        category_typical, _ = interval_stats(prior)
        if (len(prior) >= 3 and category_typical and category_typical > 0
                and (asof - history[-1]["date"]).days > 2 * category_typical
                and history[-1]["date"] < recent_start):
            dropped.append({"category": category, "lastDate": history[-1]["date"].isoformat(),
                            "previousOrders": len(prior)})
    dropped.sort(key=lambda item: (-item["previousOrders"], item["category"]))

    service_issues = []
    for order in orders:
        if order["delivered"] and order["delivered"] <= asof:
            if (order["estimated"] and order["delivered"] > order["estimated"]
                    and order["delivered"] >= asof - timedelta(days=180)):
                service_issues.append({"type": "late", "date": order["delivered"].isoformat()})
        if (order["review_date"] and asof - timedelta(days=180) <= order["review_date"] <= asof
                and order["review_score"] is not None and order["review_score"] <= 2):
            service_issues.append({"type": "review", "date": order["review_date"].isoformat(),
                                   "score": order["review_score"]})
    service_issues.sort(key=lambda issue: issue["date"], reverse=True)

    reasons = []
    risk = 0
    if established and typical and days_since is not None:
        if days_since > 2 * typical:
            risk += 40
            reasons.append({"type": "rhythm", "points": 40})
        elif days_since > 1.5 * typical:
            risk += 20
            reasons.append({"type": "rhythm", "points": 20})
        if decline >= 40:
            risk += 25
            reasons.append({"type": "spend", "points": 25})
        elif decline >= 20:
            risk += 10
            reasons.append({"type": "spend", "points": 10})
        if dropped:
            risk += 20
            reasons.append({"type": "category", "points": 20})
        if service_issues and (days_since > 1.5 * typical or decline >= 20):
            risk += 15
            reasons.append({"type": "service", "points": 15})
    risk = min(risk, 100)
    confidence = "low"
    if established and (variability is None or variability <= 1.5):
        confidence = "high" if len(orders) >= 10 and len(months) >= 6 else "medium"
    churn = bool(established and typical and days_since is not None
                 and days_since > max(90, 3 * typical))
    return {
        "accountId": account["id"], "city": account["city"], "state": account["state"],
        "orderCount": len(orders), "activeMonths": len(months), "established": established,
        "lastOrderDate": orders[-1]["date"].isoformat() if orders else None,
        "daysSinceOrder": days_since, "typicalIntervalDays": round(typical, 1) if typical else None,
        "recentSpend": recent, "baselineSpend": baseline, "spendDeclinePct": decline,
        "historicalSpend": money(sum(order["revenue"] for order in orders)),
        "droppedCategories": dropped[:3], "serviceIssues": service_issues[:3],
        "riskScore": risk, "riskReasons": reasons, "confidence": confidence,
        "churnStatus": "operational churn" if churn else "early risk" if risk else "active"
                       if established else "insufficient history",
        "monthlySpend": monthly_spend(orders, asof),
        "recentOrders": [serialize_order(order) for order in orders[-8:][::-1]],
    }


def monthly_spend(orders: list[dict], asof: date) -> list[dict]:
    by_month = defaultdict(float)
    for order in orders:
        by_month[order["date"].strftime("%Y-%m")] += order["revenue"]
    months = []
    year, month = asof.year, asof.month
    for _ in range(8):
        key = f"{year:04d}-{month:02d}"
        months.append({"month": key, "spend": money(by_month[key])})
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    return months[::-1]


def serialize_order(order: dict) -> dict:
    return {"date": order["date"].isoformat(), "revenue": money(order["revenue"]),
            "categories": sorted(order["categories"]), "status": order["status"]}


def tier_boundaries(summaries: list[dict]) -> tuple[float, float]:
    values = sorted(summary["historicalSpend"] / max(summary["activeMonths"], 1)
                    for summary in summaries if summary["established"])
    return values[len(values) // 3], values[2 * len(values) // 3]


def apply_priority(summaries: list[dict]) -> None:
    low_cut, high_cut = tier_boundaries(summaries)
    confidence_factors = {"high": 1.0, "medium": 0.7, "low": 0.4}
    value_factors = {"high": 1.0, "medium": 0.7, "low": 0.4}
    for summary in summaries:
        monthly_value = summary["historicalSpend"] / max(summary["activeMonths"], 1)
        tier = "high" if monthly_value >= high_cut else "medium" if monthly_value >= low_cut else "low"
        summary["valueTier"] = tier
        summary["priorityScore"] = round(summary["riskScore"] * confidence_factors[summary["confidence"]]
                                         * value_factors[tier], 1)


def validate_historically(accounts: dict) -> dict:
    cutoff = date(2018, 5, 31)
    cohort = []
    for account in accounts.values():
        summary = summarize(account, cutoff)
        if not summary["established"] or summary["churnStatus"] == "operational churn":
            continue
        future_order = any(cutoff < order["date"] <= ANALYSIS_DATE
                           and order["status"] not in EXCLUDED_STATUSES for order in account["orders"])
        cohort.append((summary["riskScore"], not future_order))
    cohort.sort(key=lambda pair: pair[0], reverse=True)
    top_size = max(1, len(cohort) // 5)
    return {
        "cutoff": cutoff.isoformat(), "horizonEnd": ANALYSIS_DATE.isoformat(),
        "eligibleAccounts": len(cohort), "topQuintileAccounts": top_size,
        "topQuintileNoOrderPct": round(100 * sum(outcome for _, outcome in cohort[:top_size]) / top_size, 1),
        "cohortNoOrderPct": round(100 * sum(outcome for _, outcome in cohort) / len(cohort), 1),
        "outcome": "no qualifying order in the following 92 days",
    }


def build(raw: Path = RAW, output: Path = OUTPUT) -> dict:
    accounts, orders = load_data(raw)
    summaries = [summarize(account, ANALYSIS_DATE) for account in accounts.values()]
    apply_priority(summaries)
    actionable = sorted((summary for summary in summaries if summary["riskScore"] > 0),
                        key=lambda summary: (-summary["priorityScore"], -summary["riskScore"],
                                             -summary["historicalSpend"], summary["accountId"]))[:500]
    healthy = sorted((summary for summary in summaries if summary["churnStatus"] == "active"
                      and summary["confidence"] == "high"),
                     key=lambda summary: (-summary["historicalSpend"], summary["accountId"]))[:2]
    sparse = sorted((summary for summary in summaries if summary["churnStatus"] == "insufficient history"
                     and summary["orderCount"] > 0),
                    key=lambda summary: (-summary["orderCount"], summary["accountId"]))[:2]
    selected = actionable + healthy + sparse
    category_counts = Counter(category for account in accounts.values() for order in account["orders"]
                              for category in order["categories"])
    category_aliases = {category: f"Portfolio line {index:02d}" for index, (category, _) in
                        enumerate(sorted(category_counts.items(), key=lambda pair: (-pair[1], pair[0])), 1)}
    for summary in selected:
        for dropped_category in summary["droppedCategories"]:
            dropped_category["category"] = category_aliases[dropped_category["category"]]
        for order in summary["recentOrders"]:
            order["categories"] = [category_aliases[category] for category in order["categories"]]
    payload = {
        "analysisDate": ANALYSIS_DATE.isoformat(), "sourceOrders": len(orders),
        "sourceAccounts": len(accounts), "eligibleAccounts": sum(item["established"] for item in summaries),
        "rankedAccounts": len(actionable), "historicalCheck": validate_historically(accounts),
        "accounts": selected,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=True, separators=(",", ":")), encoding="utf-8")
    return payload


if __name__ == "__main__":
    result = build()
    print(f"Wrote {len(result['accounts'])} accounts to {OUTPUT}")
    print(result["historicalCheck"])
