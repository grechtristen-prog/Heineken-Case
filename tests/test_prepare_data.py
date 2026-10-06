import csv
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

from scripts.prepare_data import ANALYSIS_DATE, load_data, qualifying_orders, summarize


def make_order(day, order_id, revenue=100, status="delivered", category="line_a",
               delivered=None, review_date=None, review_score=None):
    return {
        "id": order_id, "date": day, "status": status, "revenue": revenue,
        "categories": {category}, "delivered": delivered,
        "estimated": day + timedelta(days=10),
        "review_date": review_date, "review_score": review_score,
    }


class PrepareDataTests(unittest.TestCase):
    def test_order_lines_are_deduplicated_and_revenue_is_summed(self):
        with tempfile.TemporaryDirectory() as directory:
            raw = Path(directory)
            fields = ["account_id", "city", "state", "order_id", "order_date", "order_status",
                      "price", "product_category", "delivered_date", "estimated_delivery_date"]
            with (raw / "order_lines.csv").open("w", newline="", encoding="utf-8") as target:
                writer = csv.DictWriter(target, fieldnames=fields)
                writer.writeheader()
                writer.writerow(dict(account_id="A01003", city="sao paulo", state="SP", order_id="one",
                                     order_date="2018-08-01", order_status="delivered", price="20",
                                     product_category="a", delivered_date="", estimated_delivery_date=""))
                writer.writerow(dict(account_id="A01003", city="sao paulo", state="SP", order_id="one",
                                     order_date="2018-08-01", order_status="delivered", price="30",
                                     product_category="b", delivered_date="", estimated_delivery_date=""))
            with (raw / "order_reviews.csv").open("w", newline="", encoding="utf-8") as target:
                writer = csv.DictWriter(target, fieldnames=["order_id", "review_score", "review_answer_timestamp"])
                writer.writeheader()
            accounts, orders = load_data(raw)
            self.assertEqual(len(orders), 1)
            self.assertEqual(len(accounts["A01003"]["orders"]), 1)
            self.assertEqual(orders["one"]["revenue"], 50)
            self.assertEqual(orders["one"]["categories"], {"a", "b"})

    def test_future_and_cancelled_orders_do_not_count(self):
        account = {"orders": [
            make_order(date(2018, 8, 1), "valid"),
            make_order(date(2018, 8, 2), "cancelled", status="canceled"),
            make_order(date(2018, 9, 1), "future"),
        ]}
        self.assertEqual([order["id"] for order in qualifying_orders(account, ANALYSIS_DATE)], ["valid"])

    def test_rhythm_score_and_future_service_evidence(self):
        account = {"id": "A01003", "city": "sao paulo", "state": "SP", "orders": []}
        first = date(2018, 2, 1)
        for index in range(6):
            account["orders"].append(make_order(first + timedelta(days=index * 20), str(index)))
        last = account["orders"][-1]
        last["delivered"] = date(2018, 9, 10)
        last["review_date"] = date(2018, 9, 11)
        last["review_score"] = 1
        summary = summarize(account, ANALYSIS_DATE)
        self.assertTrue(summary["established"])
        self.assertEqual(summary["typicalIntervalDays"], 20)
        self.assertEqual(summary["daysSinceOrder"], 111)
        self.assertEqual(summary["serviceIssues"], [])
        self.assertEqual(summary["riskScore"], 85)
        self.assertEqual(summary["churnStatus"], "operational churn")
        self.assertIn("rhythm", [reason["type"] for reason in summary["riskReasons"]])
        self.assertNotIn("service", [reason["type"] for reason in summary["riskReasons"]])

    def test_sparse_history_has_no_confident_churn_score(self):
        account = {"id": "A01003", "city": "sao paulo", "state": "SP",
                   "orders": [make_order(date(2018, 1, 1), "one")]}
        summary = summarize(account, ANALYSIS_DATE)
        self.assertEqual(summary["riskScore"], 0)
        self.assertEqual(summary["confidence"], "low")
        self.assertEqual(summary["churnStatus"], "insufficient history")


if __name__ == "__main__":
    unittest.main()
