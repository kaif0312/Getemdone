'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface OnboardingState {
  hasSeenFirstTask: boolean;
  hasSeenSwipe: boolean;
  hasSeenLongPress: boolean;
  hasSeenFriends: boolean;
  hasSeenVoiceInput: boolean;
  hasSeenTemplates: boolean;
  hasSeenStreak: boolean;
  dismissedTips: string[];
  completedTour: boolean;
  dismissedFeatureBadges: string[];
}

const STORAGE_KEY = 'getdone_onboarding';

const defaultState: OnboardingState = {
  hasSeenFirstTask: false,
  hasSeenSwipe: false,
  hasSeenLongPress: false,
  hasSeenFriends: false,
  hasSeenVoiceInput: false,
  hasSeenTemplates: false,
  hasSeenStreak: false,
  dismissedTips: [],
  completedTour: false,
  dismissedFeatureBadges: [],
};

export function useOnboarding() {
  const [state, setState] = useState<OnboardingState>(defaultState);
  const [isLoaded, setIsLoaded] = useState(false);
  const lastSavedRef = useRef<string>('');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setState({
          ...parsed,
          dismissedTips: parsed.dismissedTips || [],
          dismissedFeatureBadges: parsed.dismissedFeatureBadges || [],
        });
        lastSavedRef.current = stored;
      }
    } catch (error) {
      console.error('Error loading onboarding state:', error);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // Save to localStorage whenever state changes (with debouncing)
  useEffect(() => {
    if (!isLoaded) return;
    
    try {
      const toStore = JSON.stringify(state);
      // Only save if state actually changed
      if (toStore !== lastSavedRef.current) {
        localStorage.setItem(STORAGE_KEY, toStore);
        lastSavedRef.current = toStore;
      }
    } catch (error) {
      console.error('Error saving onboarding state:', error);
    }
  }, [state, isLoaded]);

  const markFeatureSeen = useCallback((feature: keyof OnboardingState) => {
    if (feature === 'dismissedTips' || feature === 'dismissedFeatureBadges' || feature === 'completedTour') {
      return; // These are handled separately
    }
    setState(prev => {
      if (prev[feature] === true) return prev; // Already seen, no update needed
      return { ...prev, [feature]: true };
    });
  }, []);

  const dismissTip = useCallback((tipId: string) => {
    setState(prev => {
      if (prev.dismissedTips.includes(tipId)) return prev; // Already dismissed, no update needed
      // Create new array only if item is not already present
      const newTips = [...prev.dismissedTips, tipId];
      return {
        ...prev,
        dismissedTips: newTips,
      };
    });
  }, []);

  const dismissFeatureBadge = useCallback((badgeId: string) => {
    setState(prev => {
      if (prev.dismissedFeatureBadges.includes(badgeId)) return prev; // Already dismissed, no update needed
      // Create new array only if item is not already present
      const newBadges = [...prev.dismissedFeatureBadges, badgeId];
      return {
        ...prev,
        dismissedFeatureBadges: newBadges,
      };
    });
  }, []);

  // Use refs to track dismissed items for stable callbacks
  const dismissedTipsRef = useRef<Set<string>>(new Set());
  const dismissedBadgesRef = useRef<Set<string>>(new Set());
  const lastTipsKeyRef = useRef<string>('');
  const lastBadgesKeyRef = useRef<string>('');

  // Update refs when state changes (only if contents actually changed)
  useEffect(() => {
    const tipsKey = state.dismissedTips.sort().join(',');
    const badgesKey = state.dismissedFeatureBadges.sort().join(',');
    
    // Only update if contents actually changed
    if (tipsKey !== lastTipsKeyRef.current) {
      dismissedTipsRef.current = new Set(state.dismissedTips);
      lastTipsKeyRef.current = tipsKey;
    }
    
    if (badgesKey !== lastBadgesKeyRef.current) {
      dismissedBadgesRef.current = new Set(state.dismissedFeatureBadges);
      lastBadgesKeyRef.current = badgesKey;
    }
  }, [state.dismissedTips, state.dismissedFeatureBadges]);

  const shouldShowTip = useCallback((tipId: string, condition: boolean): boolean => {
    if (!condition) return false;
    if (dismissedTipsRef.current.has(tipId)) return false;
    return true;
  }, []); // No dependencies - uses ref

  const shouldShowBadge = useCallback((badgeId: string, condition: boolean): boolean => {
    if (!condition) return false;
    if (dismissedBadgesRef.current.has(badgeId)) return false;
    return true;
  }, []); // No dependencies - uses ref

  const resetOnboarding = useCallback(() => {
    setState(defaultState);
    localStorage.removeItem(STORAGE_KEY);
    lastSavedRef.current = '';
  }, []);

  return {
    state,
    isLoaded,
    markFeatureSeen,
    dismissTip,
    dismissFeatureBadge,
    shouldShowTip,
    shouldShowBadge,
    resetOnboarding,
  };
}
