import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type ActiveTooltip =
  | {
      text: string;
      target: HTMLElement;
      mode: 'pointer' | 'focus';
      placement: 'top' | 'bottom';
      pointerX: number;
      pointerY: number;
    }
  | null;

function getTooltipTarget(node: EventTarget | null): HTMLElement | null {
  if (!(node instanceof HTMLElement)) {
    return null;
  }

  const tooltipTarget = node.closest<HTMLElement>('[data-tooltip]');
  if (!tooltipTarget) {
    return null;
  }

  const text = tooltipTarget.getAttribute('data-tooltip');
  return text ? tooltipTarget : null;
}

export function TooltipLayer() {
  const [mounted, setMounted] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip>(null);
  const [viewportTick, setViewportTick] = useState(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const showTooltipFromTarget = (
      target: HTMLElement,
      mode: 'pointer' | 'focus',
      pointerX = 0,
      pointerY = 0,
    ) => {
      const text = target.getAttribute('data-tooltip');
      if (!text) {
        setActiveTooltip(null);
        return;
      }

      setActiveTooltip({
        text,
        target,
        mode,
        placement: target.getAttribute('data-tooltip-placement') === 'bottom' ? 'bottom' : 'top',
        pointerX,
        pointerY,
      });
    };

    const handleMouseOver = (event: MouseEvent) => {
      const tooltipTarget = getTooltipTarget(event.target);
      if (!tooltipTarget) {
        return;
      }

      showTooltipFromTarget(tooltipTarget, 'pointer', event.clientX, event.clientY);
    };

    const handleMouseMove = (event: MouseEvent) => {
      setActiveTooltip((current) => {
        if (!current || current.mode !== 'pointer') {
          return current;
        }

        const tooltipTarget = getTooltipTarget(event.target);
        if (!tooltipTarget || tooltipTarget !== current.target) {
          return current;
        }

        return {
          ...current,
          pointerX: event.clientX,
          pointerY: event.clientY,
        };
      });
    };

    const handleMouseOut = (event: MouseEvent) => {
      const tooltipTarget = getTooltipTarget(event.target);
      if (!tooltipTarget) {
        return;
      }

      const relatedTarget = getTooltipTarget(event.relatedTarget);
      if (relatedTarget === tooltipTarget) {
        return;
      }

      setActiveTooltip((current) => (current?.target === tooltipTarget ? null : current));
    };

    const handleFocusIn = (event: FocusEvent) => {
      const tooltipTarget = getTooltipTarget(event.target);
      if (!tooltipTarget) {
        return;
      }

      showTooltipFromTarget(tooltipTarget, 'focus');
    };

    const handleFocusOut = (event: FocusEvent) => {
      const tooltipTarget = getTooltipTarget(event.target);
      if (!tooltipTarget) {
        return;
      }

      const nextTarget = getTooltipTarget(event.relatedTarget);
      if (nextTarget === tooltipTarget) {
        return;
      }

      setActiveTooltip((current) => (current?.target === tooltipTarget ? null : current));
    };

    const handleViewportChange = () => {
      setViewportTick((current) => current + 1);
    };

    const handlePointerDown = () => {
      setActiveTooltip(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveTooltip(null);
      }
    };

    const handleWindowBlur = () => {
      setActiveTooltip(null);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        setActiveTooltip(null);
      }
    };

    window.addEventListener('mouseover', handleMouseOver);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);

    return () => {
      window.removeEventListener('mouseover', handleMouseOver);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (!activeTooltip) {
      return;
    }

    const dismissIfInvalid = () => {
      const target = activeTooltip.target;
      if (!target.isConnected || !document.contains(target)) {
        setActiveTooltip(null);
        return;
      }

      const tooltipText = target.getAttribute('data-tooltip');
      if (!tooltipText) {
        setActiveTooltip(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(target);
      const isHidden =
        computedStyle.display === 'none' ||
        computedStyle.visibility === 'hidden' ||
        computedStyle.opacity === '0' ||
        (rect.width <= 0 && rect.height <= 0);
      if (isHidden) {
        setActiveTooltip(null);
      }
    };

    dismissIfInvalid();
    const observer = new MutationObserver(dismissIfInvalid);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-tooltip', 'hidden', 'aria-hidden'],
    });

    return () => observer.disconnect();
  }, [activeTooltip]);

  useLayoutEffect(() => {
    if (!activeTooltip) {
      return;
    }

    if (!activeTooltip.target.isConnected || !document.contains(activeTooltip.target)) {
      setActiveTooltip(null);
    }
  }, [activeTooltip, viewportTick]);

  const tooltipStyle = useMemo(() => {
    if (!activeTooltip) {
      return null;
    }

    const margin = 14;
    const rect = activeTooltip.target.getBoundingClientRect();
    const baseLeft =
      activeTooltip.mode === 'pointer'
        ? activeTooltip.pointerX
        : rect.left + rect.width / 2;
    const isBottomPlacement = activeTooltip.placement === 'bottom';
    const baseTop = isBottomPlacement
      ? activeTooltip.mode === 'pointer'
        ? Math.max(activeTooltip.pointerY + margin, rect.bottom + margin)
        : rect.bottom + margin
      : activeTooltip.mode === 'pointer'
        ? Math.min(activeTooltip.pointerY - margin, rect.top - margin)
        : rect.top - margin;

    return {
      left: `${Math.min(window.innerWidth - 20, Math.max(20, baseLeft))}px`,
      top: `${Math.max(12, baseTop)}px`,
      transform: isBottomPlacement ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
    };
  }, [activeTooltip, viewportTick]);

  if (!mounted || !activeTooltip || !tooltipStyle) {
    return null;
  }

  return createPortal(
    <div className="global-tooltip" style={tooltipStyle} role="tooltip">
      {activeTooltip.text}
    </div>,
    document.body,
  );
}
