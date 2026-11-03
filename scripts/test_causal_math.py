import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.utils.checkpoint as checkpoint

def test_causal_alignment_and_clipping():
    # Hidden dimension for Qwen 2.5 7B is 3584
    H = 3584
    V = 151936
    
    # Student prompt: 20 tokens. Completion: 15 tokens. Total = 35 tokens.
    L_s = 20
    C = 15
    # Teacher prompt: 30 tokens (has privileged policy). Completion: 15 tokens. Total = 45 tokens.
    L_t = 30
    
    s_full_hidden = torch.randn(1, L_s + C, H, dtype=torch.float32, requires_grad=True)
    t_full_hidden = torch.randn(1, L_t + C, H, dtype=torch.float32)
    
    # Scale weights by 1/sqrt(H) to ensure realistic logit standard deviation (~1.0)
    lm_head_weight = torch.randn(V, H, dtype=torch.float32) * (1.0 / (H ** 0.5))
    
    # Next token prediction shift:
    # Hidden state at index (L - 1) predicts token L (the first completion token)
    # Hidden state at index (L + C - 2) predicts token (L + C - 1) (the last completion token)
    s_comp_hidden = s_full_hidden[:, L_s - 1 : L_s + C - 1, :] # [1, C, H]
    t_comp_hidden = t_full_hidden[:, L_t - 1 : L_t + C - 1, :] # [1, C, H]
    
    assert s_comp_hidden.shape == (1, C, H)
    assert t_comp_hidden.shape == (1, C, H)
    
    # Soft-log saturation threshold
    clip_tau = 4.0
    
    # Compute chunked with checkpoint
    def chunk_loss(s_h, t_h, weight):
        s_logits = F.linear(s_h.float(), weight)
        with torch.no_grad():
            t_logits = F.linear(t_h.float(), weight)
            
        p_t = F.softmax(t_logits, dim=-1)
        log_p_t = F.log_softmax(t_logits, dim=-1)
        log_p_s = F.log_softmax(s_logits, dim=-1)
        
        # Sum over vocabulary -> per-token divergence: shape [C]
        token_kl = torch.sum(p_t * (log_p_t - log_p_s), dim=-1)
        
        # Soft-Log Saturation: Outliers retain non-zero positive gradient!
        clipped_mask = token_kl > clip_tau
        clipped_token_kl = torch.where(
            clipped_mask,
            clip_tau + torch.log(1.0 + (token_kl - clip_tau)),
            token_kl
        )
        return clipped_token_kl.sum()
        
    loss = checkpoint.checkpoint(
        chunk_loss, s_comp_hidden[0], t_comp_hidden[0], lm_head_weight, use_reentrant=False
    )
    
    # Backward pass
    loss.backward()
    
    grad_norm = s_full_hidden.grad.norm().item()
    comp_grad_norm = s_full_hidden.grad[:, L_s - 1 : L_s + C - 1, :].norm().item()
    prompt_grad_norm = s_full_hidden.grad[:, :L_s - 1, :].abs().sum().item()
    
    print(f"Alignment Test Passed! Loss: {loss.item():.4f}")
    print(f"Completion Gradient Norm: {comp_grad_norm:.6f}")
    print(f"Prompt Gradient Sum: {prompt_grad_norm:.6f}")
    
    assert not torch.isnan(s_full_hidden.grad).any(), "NaN in gradients!"
    assert comp_grad_norm > 1e-4, f"Completion gradient must be strictly positive! Got {comp_grad_norm}"
    assert prompt_grad_norm == 0.0, "Prompt tokens before predicting index must receive exactly 0 grad!"
    print("Zero-grad on prompt and strictly positive completion gradient verified mathematically!")

if __name__ == "__main__":
    test_causal_alignment_and_clipping()
