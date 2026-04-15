import csv
from collections import Counter
import math

# Load data
rows = []
with open(r'C:\Users\motiv\Documents\durag-pkg\real-data\WA_Fn-UseC_-Telco-Customer-Churn.csv', 'r') as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

print(f"Total rows: {len(rows)}")
churned = [r for r in rows if r['Churn'] == 'Yes']
retained = [r for r in rows if r['Churn'] == 'No']
print(f"Churned: {len(churned)}, Retained: {len(retained)}")

# ---- Build a logistic-regression-style scoring model from churned vs retained ----
# We'll compute churn rates per feature value, then build a weighted risk score.

# Features to analyze
categorical_features = [
    'gender', 'SeniorCitizen', 'Partner', 'Dependents', 'PhoneService',
    'MultipleLines', 'InternetService', 'OnlineSecurity', 'OnlineBackup',
    'DeviceProtection', 'TechSupport', 'StreamingTV', 'StreamingMovies',
    'Contract', 'PaperlessBilling', 'PaymentMethod'
]

# Compute churn rate per category value => log-odds ratio as weight
feature_weights = {}  # feature -> {value -> weight}
base_churn_rate = len(churned) / len(rows)
print(f"\nBase churn rate: {base_churn_rate:.4f}")

for feat in categorical_features:
    feature_weights[feat] = {}
    values = set(r[feat] for r in rows)
    for val in values:
        total = sum(1 for r in rows if r[feat] == val)
        churn_count = sum(1 for r in rows if r[feat] == val and r['Churn'] == 'Yes')
        churn_rate = churn_count / total if total > 0 else 0
        # Log-odds ratio relative to base rate
        # Clamp to avoid log(0)
        cr = max(min(churn_rate, 0.999), 0.001)
        br = max(min(base_churn_rate, 0.999), 0.001)
        log_odds = math.log(cr / (1 - cr)) - math.log(br / (1 - br))
        feature_weights[feat][val] = log_odds

# Numeric features: tenure and MonthlyCharges
# Bin tenure into groups and compute churn rate per bin
def bin_tenure(t):
    t = int(t)
    if t <= 6: return '0-6'
    elif t <= 12: return '7-12'
    elif t <= 24: return '13-24'
    elif t <= 48: return '25-48'
    else: return '49+'

def bin_monthly(m):
    m = float(m)
    if m <= 30: return '0-30'
    elif m <= 50: return '31-50'
    elif m <= 70: return '51-70'
    elif m <= 90: return '71-90'
    else: return '91+'

for feat_name, bin_func, raw_feat in [('tenure_bin', bin_tenure, 'tenure'), ('monthly_bin', bin_monthly, 'MonthlyCharges')]:
    feature_weights[feat_name] = {}
    values = set(bin_func(r[raw_feat]) for r in rows)
    for val in values:
        total = sum(1 for r in rows if bin_func(r[raw_feat]) == val)
        churn_count = sum(1 for r in rows if bin_func(r[raw_feat]) == val and r['Churn'] == 'Yes')
        churn_rate = churn_count / total if total > 0 else 0
        cr = max(min(churn_rate, 0.999), 0.001)
        br = max(min(base_churn_rate, 0.999), 0.001)
        log_odds = math.log(cr / (1 - cr)) - math.log(br / (1 - br))
        feature_weights[feat_name][val] = log_odds

# ---- Compute feature importance (variance of log-odds across values, weighted by population) ----
print("\n=== FEATURE IMPORTANCE (by weighted variance of log-odds) ===")
feature_importance = {}
for feat in feature_weights:
    vals = feature_weights[feat]
    # Population-weighted variance
    if feat == 'tenure_bin':
        counts = Counter(bin_tenure(r['tenure']) for r in rows)
    elif feat == 'monthly_bin':
        counts = Counter(bin_monthly(r['MonthlyCharges']) for r in rows)
    else:
        counts = Counter(r[feat] for r in rows)
    total_pop = sum(counts.values())
    mean_lo = sum(vals[v] * counts[v] for v in vals) / total_pop
    variance = sum(counts[v] * (vals[v] - mean_lo)**2 for v in vals) / total_pop
    feature_importance[feat] = variance

sorted_importance = sorted(feature_importance.items(), key=lambda x: -x[1])
for feat, imp in sorted_importance:
    print(f"  {feat}: {imp:.4f}")

top3_features = [f[0] for f in sorted_importance[:3]]
print(f"\nTop 3 predictive features: {top3_features}")

# ---- Score each retained customer ----
def score_customer(r):
    s = 0.0
    for feat in categorical_features:
        val = r[feat]
        s += feature_weights[feat].get(val, 0)
    s += feature_weights['tenure_bin'].get(bin_tenure(r['tenure']), 0)
    s += feature_weights['monthly_bin'].get(bin_monthly(r['MonthlyCharges']), 0)
    return s

# Score all retained customers
scored_retained = []
for r in retained:
    s = score_customer(r)
    scored_retained.append((r, s))

# Sort by score descending (higher = more likely to churn)
scored_retained.sort(key=lambda x: -x[1])

# ---- Determine threshold ----
# Use the model on churned customers to calibrate
churned_scores = [score_customer(r) for r in churned]
churned_scores.sort()
# Threshold: median of churned scores (customers scoring above this among retained are pre-churn)
median_idx = len(churned_scores) // 2
threshold = churned_scores[median_idx]
print(f"\nChurned score stats: min={min(churned_scores):.3f}, median={threshold:.3f}, max={max(churned_scores):.3f}")
print(f"Churned mean score: {sum(churned_scores)/len(churned_scores):.3f}")

retained_scores_only = [s for _, s in scored_retained]
print(f"Retained score stats: min={min(retained_scores_only):.3f}, median={retained_scores_only[len(retained_scores_only)//2]:.3f}, max={max(retained_scores_only):.3f}")
print(f"Retained mean score: {sum(retained_scores_only)/len(retained_scores_only):.3f}")

# Flag retained customers whose score >= threshold
flagged = [(r, s) for r, s in scored_retained if s >= threshold]
print(f"\n=== FLAGGED PRE-CHURN CUSTOMERS ===")
print(f"Threshold (median churned score): {threshold:.4f}")
print(f"Number flagged: {len(flagged)} out of {len(retained)} retained customers ({100*len(flagged)/len(retained):.2f}%)")

# ---- Top 10 by score ----
print(f"\n=== TOP 10 HIGHEST-RISK RETAINED CUSTOMERS ===")
print(f"{'Rank':<6}{'CustomerID':<15}{'Score':<10}{'Tenure':<8}{'Contract':<20}{'Internet':<15}{'Monthly':<10}")
for i, (r, s) in enumerate(flagged[:10]):
    print(f"{i+1:<6}{r['customerID']:<15}{s:<10.4f}{r['tenure']:<8}{r['Contract']:<20}{r['InternetService']:<15}{r['MonthlyCharges']:<10}")

# ---- Detailed stats on flagged group ----
print(f"\n=== FLAGGED GROUP PROFILE ===")

# Month-to-month percentage
mtm_count = sum(1 for r, _ in flagged if r['Contract'] == 'Month-to-month')
mtm_pct = 100 * mtm_count / len(flagged)
print(f"Month-to-month contract: {mtm_count}/{len(flagged)} = {mtm_pct:.2f}%")

# Fiber optic percentage
fiber_count = sum(1 for r, _ in flagged if r['InternetService'] == 'Fiber optic')
fiber_pct = 100 * fiber_count / len(flagged)
print(f"Fiber optic internet: {fiber_count}/{len(flagged)} = {fiber_pct:.2f}%")

# No tech support percentage
notech_count = sum(1 for r, _ in flagged if r['TechSupport'] == 'No')
notech_pct = 100 * notech_count / len(flagged)
print(f"No tech support: {notech_count}/{len(flagged)} = {notech_pct:.2f}%")

# Average tenure
avg_tenure = sum(int(r['tenure']) for r, _ in flagged) / len(flagged)
print(f"Average tenure: {avg_tenure:.2f} months")

# Average MonthlyCharges
avg_monthly = sum(float(r['MonthlyCharges']) for r, _ in flagged) / len(flagged)
print(f"Average MonthlyCharges: ${avg_monthly:.2f}")

# ---- Validation: what would the model score on known churned? ----
print(f"\n=== MODEL VALIDATION ===")
# How many churned customers score >= threshold?
churned_above = sum(1 for s in churned_scores if s >= threshold)
print(f"Churned customers above threshold: {churned_above}/{len(churned)} = {100*churned_above/len(churned):.2f}%")
# How many retained score below threshold?
retained_below = sum(1 for _, s in scored_retained if s < threshold)
print(f"Retained customers below threshold: {retained_below}/{len(retained)} = {100*retained_below/len(retained):.2f}%")
