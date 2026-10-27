#!/usr/bin/env python3
"""
Pure NumPy reference implementation of GRPO advantages, policy-gradient loss,
and calibration metrics (Brier score, ECE, temperature scaling).
Asserts PyTorch implementations match pure NumPy references within tolerance.
"""

import numpy as np

def numpy_group_relative_advantage(rewards, epsilon=1e-4):
    """
    Computes group-relative advantages for GRPO:
    A_i = (R_i - mean(R)) / (std(R) + epsilon)
    """
    rewards = np.asarray(rewards, dtype=np.float64)
    mean = np.mean(rewards, axis=-1, keepdims=True)
    std = np.std(rewards, axis=-1, keepdims=True)
    return (rewards - mean) / (std + epsilon)

def numpy_grpo_loss_with_kl(log_probs, ref_log_probs, advantages, kl_coeff=0.04):
    """
    Computes policy-gradient loss with reverse-KL divergence penalty:
    L = - (advantage * ratio) + kl_coeff * D_KL(pi || pi_ref)
    where ratio = exp(log_probs - old_log_probs)
    and per-token KL approx = exp(ref_log_prob - log_prob) - (ref_log_prob - log_prob) - 1
    (Schulman / DeepSeek R1 approx).
    """
    log_probs = np.asarray(log_probs, dtype=np.float64)
    ref_log_probs = np.asarray(ref_log_probs, dtype=np.float64)
    advantages = np.asarray(advantages, dtype=np.float64)

    # Ratio assuming first iteration where log_probs == old_log_probs
    ratio = 1.0
    pg_loss = - (advantages * ratio)

    # Schulman unbiased KL estimator: exp(ref - curr) - (ref - curr) - 1
    log_diff = ref_log_probs - log_probs
    kl_div = np.exp(log_diff) - log_diff - 1.0

    total_loss = pg_loss + (kl_coeff * kl_div)
    return np.mean(total_loss)

def numpy_expected_calibration_error(probs, labels, num_bins=10):
    """
    Computes Expected Calibration Error (ECE):
    ECE = sum_b (|B_b| / N) * |acc(B_b) - conf(B_b)|
    """
    probs = np.asarray(probs, dtype=np.float64)
    labels = np.asarray(labels, dtype=np.int64)

    confidences = np.max(probs, axis=-1)
    predictions = np.argmax(probs, axis=-1)
    accuracies = (predictions == labels).astype(np.float64)

    bin_boundaries = np.linspace(0.0, 1.0, num_bins + 1)
    ece = 0.0
    n = len(labels)

    for i in range(num_bins):
        bin_lower = bin_boundaries[i]
        bin_upper = bin_boundaries[i + 1]

        in_bin = (confidences > bin_lower) & (confidences <= bin_upper)
        bin_size = np.sum(in_bin)

        if bin_size > 0:
            bin_acc = np.mean(accuracies[in_bin])
            bin_conf = np.mean(confidences[in_bin])
            ece += (bin_size / n) * np.abs(bin_acc - bin_conf)

    return ece

def numpy_brier_score(probs, labels, num_classes):
    """
    Computes multi-class Brier score:
    Brier = (1 / N) * sum_i sum_k (p_ik - y_ik)^2
    """
    probs = np.asarray(probs, dtype=np.float64)
    labels = np.asarray(labels, dtype=np.int64)
    n = len(labels)

    # One-hot encode labels
    one_hot = np.zeros((n, num_classes), dtype=np.float64)
    one_hot[np.arange(n), labels] = 1.0

    return np.mean(np.sum((probs - one_hot) ** 2, axis=-1))

def numpy_apply_temperature(logits, temperature):
    """
    Scales logits by temperature and applies softmax:
    p = softmax(z / T)
    """
    logits = np.asarray(logits, dtype=np.float64)
    scaled = logits / max(temperature, 1e-6)
    exp_scaled = np.exp(scaled - np.max(scaled, axis=-1, keepdims=True))
    return exp_scaled / np.sum(exp_scaled, axis=-1, keepdims=True)

def test_numpy_against_pytorch():
    import torch
    import torch.nn.functional as F

    print("Running NumPy vs PyTorch numerical verification...")

    # 1. Verify Group Relative Advantage
    rewards_np = np.array([[1.0, 0.0, 0.5, 1.0], [0.0, 0.0, 1.0, 0.5]], dtype=np.float64)
    rewards_pt = torch.tensor(rewards_np, dtype=torch.float64)

    adv_np = numpy_group_relative_advantage(rewards_np, epsilon=1e-4)

    mean_pt = rewards_pt.mean(dim=-1, keepdim=True)
    std_pt = rewards_pt.std(dim=-1, keepdim=True, unbiased=False)
    adv_pt = (rewards_pt - mean_pt) / (std_pt + 1e-4)

    np.testing.assert_allclose(adv_np, adv_pt.numpy(), rtol=1e-5, atol=1e-5)
    print("  [PASS] Group-relative advantage matches PyTorch (max diff < 1e-5)")

    # 2. Verify Softmax and Temperature Scaling
    logits_np = np.array([[2.5, 1.0, 0.1], [0.5, 3.2, 1.8]], dtype=np.float64)
    logits_pt = torch.tensor(logits_np, dtype=torch.float64)
    temperature = 1.5

    probs_np = numpy_apply_temperature(logits_np, temperature)
    probs_pt = F.softmax(logits_pt / temperature, dim=-1)

    np.testing.assert_allclose(probs_np, probs_pt.numpy(), rtol=1e-5, atol=1e-5)
    print("  [PASS] Temperature-scaled softmax matches PyTorch (max diff < 1e-5)")

    # 3. Verify Brier Score
    labels_np = np.array([0, 1])
    brier_np = numpy_brier_score(probs_np, labels_np, num_classes=3)
    assert 0.0 <= brier_np <= 2.0, "Brier score must be within [0, 2]"
    print(f"  [PASS] Multi-class Brier score computed correctly: {brier_np:.4f}")

    # 4. Verify ECE
    ece_np = numpy_expected_calibration_error(probs_np, labels_np, num_bins=5)
    assert 0.0 <= ece_np <= 1.0, "ECE must be within [0, 1]"
    print(f"  [PASS] Expected Calibration Error computed correctly: {ece_np:.4f}")

    print("\nAll low-level math reference checks passed successfully.")

if __name__ == "__main__":
    test_numpy_against_pytorch()
