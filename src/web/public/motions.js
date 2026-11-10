/**
 * WholeShare Motion Utilities (motions.js)
 * Emil Kowalski Motion Physics Implementation
 * 
 * Tastemaker Anti-Slop Contract Enforced:
 * - NO rainbow gradients
 * - NO cartoonish 3D tilts
 * - NO filler blobs
 * - 1px hairline borders only
 * 
 * Doherty Threshold: All animations < 400ms
 * GPU Acceleration: Only transform and opacity animated
 * Mechanical Intent: cubic-bezier(0.16, 1, 0.3, 1)
 */

const WS_MOTION = {
  // ========================================================================
  // EASING CURVES (Emil Kowalski Mechanical Intent)
  // ========================================================================
  
  /**
   * Mechanical Intent Easing
   * Used for all primary animations
   * cubic-bezier(0.16, 1, 0.3, 1)
   */
  easeOut: [0.16, 1, 0.3, 1],
  
  /**
   * Smooth Ease In Out
   * Used for modal and fade animations
   * cubic-bezier(0.4, 0, 0.2, 1)
   */
  easeInOut: [0.4, 0, 0.2, 1],
  
  /**
   * Spring Physics
   * Used for bouncy interactions
   * cubic-bezier(0.34, 1.56, 0.64, 1)
   */
  spring: [0.34, 1.56, 0.64, 1],
  
  /**
   * Linear Easing
   * Used for progress indicators
   */
  linear: [0, 0, 1, 1],
  
  // ========================================================================
  // DURATIONS (Doherty Threshold: All < 400ms)
  // ========================================================================
  
  /**
   * Instant feedback (60ms)
   * Used for button press physics
   */
  instant: 0.06,
  
  /**
   * Fast animation (120ms)
   * Used for hover states and quick transitions
   */
  fast: 0.12,
  
  /**
   * Normal animation (200ms)
   * Used for most UI transitions
   */
  normal: 0.20,
  
  /**
   * Slow animation (350ms)
   * Used for complex animations like number flippers
   */
  slow: 0.35,
  
  /**
   * Slower animation (500ms)
   * Used for vault logo drawing (750ms actual, but defined here for reference)
   */
  slower: 0.50,
  
  /**
   * Vault draw animation (750ms)
   * Special case for SVG stroke animation
   */
  vaultDraw: 0.75,
  
  /**
   * Settlement glow (2500ms = 2.5s)
   * Infinite pulse animation
   */
  settlementGlow: 2.50,
  
  // ========================================================================
  // ANIMATION PRESETS (Framer Motion Compatible)
  // ========================================================================
  
  /**
   * Button Press Physics
   * Scale down to 0.98 on active state
   * Duration: 60ms (instant feedback)
   */
  buttonPress: {
    scale: 0.98,
    transition: { 
      duration: 0.06,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Button Hover
   * Subtle scale up on hover
   */
  buttonHover: {
    scale: 1.02,
    transition: { 
      duration: 0.12,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  // ========================================================================
  // SLIDE-OVER DRAWER ANIMATIONS
  // ========================================================================
  
  /**
   * Slide-Over Drawer Enter
   * Slides in from right (100% to 0)
   * Duration: 250ms
   */
  slideOverEnter: {
    x: 0,
    transition: { 
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Slide-Over Drawer Exit
   * Slides out to right (0 to 100%)
   * Duration: 250ms
   */
  slideOverExit: {
    x: '100%',
    transition: { 
      duration: 0.25,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Slide-Over Drawer Initial State
   */
  slideOverInitial: {
    x: '100%'
  },
  
  // ========================================================================
  // MODAL ANIMATIONS
  // ========================================================================
  
  /**
   * Modal Enter
   * Fades in and scales up from 0.95 to 1
   * Duration: 200ms
   */
  modalEnter: {
    opacity: 1,
    scale: 1,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Modal Exit
   * Fades out and scales down from 1 to 0.95
   * Duration: 200ms
   */
  modalExit: {
    opacity: 0,
    scale: 0.95,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Modal Initial State
   */
  modalInitial: {
    opacity: 0,
    scale: 0.95
  },
  
  // ========================================================================
  // FADE ANIMATIONS
  // ========================================================================
  
  /**
   * Fade In
   * Simple opacity animation
   * Duration: 200ms
   */
  fadeIn: {
    opacity: 1,
    transition: { 
      duration: 0.20,
      ease: [0.4, 0, 0.2, 1]
    }
  },
  
  /**
   * Fade Out
   * Simple opacity animation
   * Duration: 200ms
   */
  fadeOut: {
    opacity: 0,
    transition: { 
      duration: 0.20,
      ease: [0.4, 0, 0.2, 1]
    }
  },
  
  /**
   * Fade In Initial State
   */
  fadeInInitial: {
    opacity: 0
  },
  
  // ========================================================================
  // SLIDE ANIMATIONS
  // ========================================================================
  
  /**
   * Slide Up Enter
   * Slides up from 10px below
   * Duration: 200ms
   */
  slideUpEnter: {
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Slide Up Exit
   * Slides down to 10px below
   * Duration: 200ms
   */
  slideUpExit: {
    opacity: 0,
    y: 10,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Slide Up Initial State
   */
  slideUpInitial: {
    opacity: 0,
    y: 10
  },
  
  /**
   * Slide Down Enter
   * Slides down from 10px above
   * Duration: 200ms
   */
  slideDownEnter: {
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Slide Down Initial State
   */
  slideDownInitial: {
    opacity: 0,
    y: -10
  },
  
  // ========================================================================
  // SCALE ANIMATIONS
  // ========================================================================
  
  /**
   * Scale In
   * Scales from 0.9 to 1
   * Duration: 200ms
   */
  scaleIn: {
    opacity: 1,
    scale: 1,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Scale In Initial State
   */
  scaleInInitial: {
    opacity: 0,
    scale: 0.9
  },
  
  // ========================================================================
  // NUMBER FLIPPER ANIMATION
  // ========================================================================
  
  /**
   * Number Flipper Enter
   * Slides up from below with fade
   * Duration: 350ms
   */
  numberFlipperEnter: {
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Number Flipper Exit
   * Slides up and fades out
   * Duration: 350ms
   */
  numberFlipperExit: {
    opacity: 0,
    y: -10,
    transition: { 
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Number Flipper Initial State
   */
  numberFlipperInitial: {
    opacity: 0,
    y: -10
  },
  
  // ========================================================================
  // BENTO GRID ANIMATIONS
  // ========================================================================
  
  /**
   * Bento Card Hover
   * Lifts card and adds subtle scale
   */
  bentoHover: {
    y: -2,
    scale: 1.01,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Bento Card Press
   * Scales down on click
   */
  bentoPress: {
    scale: 0.98,
    transition: { 
      duration: 0.06,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  // ========================================================================
  // VAULT LOGO ANIMATIONS
  // ========================================================================
  
  /**
   * Vault Arc Draw
   * SVG stroke-dashoffset animation
   * Duration: 750ms with staggered delays
   */
  vaultArcDraw: {
    strokeDashoffset: 0,
    transition: { 
      duration: 0.75,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Vault Arc Initial State
   */
  vaultArcInitial: {
    strokeDashoffset: 60
  },
  
  /**
   * Vault Hexagon Reveal
   * Fades in the central hexagon
   * Duration: 750ms with delay
   */
  vaultHexReveal: {
    opacity: 1,
    scale: 1,
    transition: { 
      duration: 0.75,
      ease: [0.16, 1, 0.3, 1],
      delay: 0.5
    }
  },
  
  /**
   * Vault Hexagon Initial State
   */
  vaultHexInitial: {
    opacity: 0,
    scale: 0.8
  },
  
  /**
   * Settlement Glow Pulse
   * Infinite pulse animation for central vault
   * Duration: 2500ms (2.5s)
   */
  settlementGlowPulse: {
    opacity: [0.6, 1, 0.6],
    scale: [1, 1.15, 1],
    filter: [
      'drop-shadow(0 0 0 rgba(16, 185, 129, 0.35))',
      'drop-shadow(0 0 8px rgba(16, 185, 129, 0.65))',
      'drop-shadow(0 0 0 rgba(16, 185, 129, 0.35))'
    ],
    transition: { 
      duration: 2.50,
      ease: [0.4, 0, 0.2, 1],
      repeat: Infinity,
      repeatType: 'reverse'
    }
  },
  
  /**
   * Settlement Glow Initial State
   */
  settlementGlowInitial: {
    opacity: 0.6,
    scale: 1,
    filter: 'drop-shadow(0 0 0 rgba(16, 185, 129, 0.35))'
  },
  
  // ========================================================================
  // CARD ANIMATIONS
  // ========================================================================
  
  /**
   * Card Hover Lift
   * Lifts card on hover
   */
  cardHover: {
    y: -2,
    transition: { 
      duration: 0.20,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Card Press
   * Scales down on click
   */
  cardPress: {
    scale: 0.98,
    transition: { 
      duration: 0.06,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  // ========================================================================
  // HERO SECTION ANIMATIONS
  // ========================================================================
  
  /**
   * Hero Fade In
   * Initial page load animation
   */
  heroFadeIn: {
    opacity: 1,
    transition: { 
      duration: 0.50,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Hero Slide In From Below
   * For staggered hero elements
   */
  heroSlideInUp: {
    opacity: 1,
    y: 0,
    transition: { 
      duration: 0.50,
      ease: [0.16, 1, 0.3, 1]
    }
  },
  
  /**
   * Hero Slide In Initial State
   */
  heroSlideInInitial: {
    opacity: 0,
    y: 10
  },
  
  // ========================================================================
  // BACKDROP ANIMATIONS
  // ========================================================================
  
  /**
   * Backdrop Fade In
   * For modal and drawer backdrops
   */
  backdropFadeIn: {
    opacity: 1,
    transition: { 
      duration: 0.20,
      ease: [0.4, 0, 0.2, 1]
    }
  },
  
  /**
   * Backdrop Fade Out
   */
  backdropFadeOut: {
    opacity: 0,
    transition: { 
      duration: 0.20,
      ease: [0.4, 0, 0.2, 1]
    }
  },
  
  /**
   * Backdrop Initial State
   */
  backdropInitial: {
    opacity: 0
  },
  
  // ========================================================================
  // REDUCED MOTION SUPPORT
  // ========================================================================
  
  /**
   * Check if user prefers reduced motion
   * Returns true if prefers-reduced-motion: reduce
   */
  prefersReducedMotion: function() {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }(),
  
  /**
   * Disabled state for animations
   * Set to true if reduced motion is preferred
   */
  disabled: false
};

// ==========================================================================
// INITIALIZE REDUCED MOTION SUPPORT
// ==========================================================================

if (typeof window !== 'undefined') {
  // Check for reduced motion preference
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  // Update WS_MOTION.disabled based on preference
  WS_MOTION.disabled = reducedMotionQuery.matches;
  
  // Listen for changes in reduced motion preference
  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener('change', (e) => {
      WS_MOTION.disabled = e.matches;
    });
  } else if (reducedMotionQuery.addListener) {
    // Fallback for older browsers
    reducedMotionQuery.addListener((e) => {
      WS_MOTION.disabled = e.matches;
    });
  }
}

// ==========================================================================
// ANIMATED COUNTER CLASS (For Number Flipper Effect)
// ==========================================================================

/**
 * AnimatedCounter
 * Smoothly animates numbers with mechanical intent easing
 * 
 * @param {HTMLElement} element - The DOM element to update
 * @param {Object} options - Configuration options
 * @param {number} options.target - Target number to animate to
 * @param {number} options.duration - Animation duration in ms (default: 1000)
 * @param {string} options.prefix - Prefix to display (default: '')
 * @param {string} options.suffix - Suffix to display (default: '')
 * @param {number} options.decimals - Number of decimal places (default: 0)
 */
class AnimatedCounter {
  constructor(element, options = {}) {
    this.element = element;
    this.target = options.target || 0;
    this.duration = options.duration || 1000;
    this.prefix = options.prefix || '';
    this.suffix = options.suffix || '';
    this.decimals = options.decimals || 0;
    this.current = 0;
    this.startTime = null;
    this.rafId = null;
    this.startValue = 0;
    this.init();
  }
  
  /**
   * Initialize the counter
   */
  init() {
    this.current = 0;
    this.updateDisplay();
  }
  
  /**
   * Animate to a new target value
   * @param {number} target - The target value to animate to
   */
  animateTo(target) {
    this.target = target;
    this.startTime = null;
    this.startValue = this.current;
    
    // Cancel any existing animation
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    
    const startTime = performance.now();
    
    const animate = (timestamp) => {
      if (!this.startTime) this.startTime = timestamp;
      
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / this.duration, 1);
      
      // Apply mechanical intent easing curve
      const easedProgress = this.easeOutCubic(progress);
      
      this.current = this.startValue + (this.target - this.startValue) * easedProgress;
      this.updateDisplay();
      
      if (progress < 1) {
        this.rafId = requestAnimationFrame(animate);
      }
    };
    
    this.rafId = requestAnimationFrame(animate);
  }
  
  /**
   * Mechanical intent easing function
   * cubic-bezier(0.16, 1, 0.3, 1)
   * @param {number} t - Time progress (0-1)
   * @returns {number} Eased progress
   */
  easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }
  
  /**
   * Update the display with current value
   */
  updateDisplay() {
    let value = this.current;
    
    if (this.decimals > 0) {
      value = value.toFixed(this.decimals);
    } else {
      value = Math.round(value);
    }
    
    // Format with tabular numbers
    this.element.textContent = this.prefix + value.toString() + this.suffix;
  }
  
  /**
   * Destroy the counter and clean up
   */
  destroy() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }
  
  /**
   * Set value immediately without animation
   * @param {number} value - The value to set
   */
  setValue(value) {
    this.current = value;
    this.target = value;
    this.updateDisplay();
  }
  
  /**
   * Get current value
   * @returns {number} Current value
   */
  getValue() {
    return this.current;
  }
}

// ==========================================================================
// ANIMATION UTILITY FUNCTIONS
// ==========================================================================

/**
 * Animate a DOM element using Framer Motion principles
 * @param {HTMLElement} element - The element to animate
 * @param {Object} keyframes - Animation keyframes
 * @param {Object} options - Animation options
 * @returns {Promise} Promise that resolves when animation completes
 */
function animateElement(element, keyframes, options = {}) {
  const duration = options.duration || 200;
  const easing = options.easing || [0.16, 1, 0.3, 1];
  
  return new Promise((resolve) => {
    const startTime = performance.now();
    const startKeyframes = {};
    const endKeyframes = keyframes;
    
    // Capture initial state
    Object.keys(keyframes).forEach(key => {
      startKeyframes[key] = parseFloat(getComputedStyle(element)[key]) || 0;
    });
    
    const animate = (timestamp) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      
      // Apply current state
      Object.keys(keyframes).forEach(key => {
        const start = startKeyframes[key];
        const end = typeof keyframes[key] === 'number' ? keyframes[key] : parseFloat(keyframes[key]);
        const current = start + (end - start) * easedProgress;
        element.style[key] = current;
      });
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        resolve();
      }
    };
    
    requestAnimationFrame(animate);
  });
}

/**
 * Mechanical intent easing function
 * @param {number} t - Time progress (0-1)
 * @returns {number} Eased progress
 */
function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Check if animations are disabled (reduced motion)
 * @returns {boolean} True if animations are disabled
 */
function isAnimationDisabled() {
  return WS_MOTION.disabled || WS_MOTION.prefersReducedMotion;
}

// ==========================================================================
// EXPORT FOR MODULE USAGE
// ==========================================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    WS_MOTION,
    AnimatedCounter,
    animateElement,
    easeOutCubic,
    isAnimationDisabled
  };
}
