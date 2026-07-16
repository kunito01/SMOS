"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from "react";
import {
  disarmCloudKitSignInMessageGuard,
  forgetCloudKitIdentity,
  getCloudKitConfigurationStatus,
  noteCloudKitSignedIn,
  setUpCloudKitAuth,
  whenCloudKitUserSignsIn,
  whenCloudKitUserSignsOut,
  type CloudKitUserIdentity
} from "@/lib/storage/cloudkit/cloudkit-client";

const SIGN_IN_RECONCILE_GRACE_MS = 8_000;

export type CloudKitAuthPhase =
  | "checking"
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "error";

type CloudKitAuthState = {
  phase: CloudKitAuthPhase;
  identity: CloudKitUserIdentity | null;
  error: string | null;
};

type CloudKitAuthContextValue = CloudKitAuthState & {
  configured: boolean;
  refresh: () => Promise<CloudKitUserIdentity | null>;
  noteSignInStarted: () => void;
};

type CloudKitAuthAction =
  | { type: "checking" }
  | { type: "signing-in" }
  | { type: "signed-in"; identity: CloudKitUserIdentity }
  | { type: "signed-out" }
  | { type: "error"; message: string };

const CloudKitAuthContext = createContext<CloudKitAuthContextValue | null>(null);

const initialState: CloudKitAuthState = {
  phase: "checking",
  identity: null,
  error: null
};

const reduceCloudKitAuth = (
  state: CloudKitAuthState,
  action: CloudKitAuthAction
): CloudKitAuthState => {
  switch (action.type) {
    case "checking":
      return state.identity ? state : { ...state, phase: "checking", error: null };
    case "signing-in":
      return state.identity ? state : { ...state, phase: "signing-in", error: null };
    case "signed-in":
      return { phase: "signed-in", identity: action.identity, error: null };
    case "signed-out":
      return { phase: "signed-out", identity: null, error: null };
    case "error":
      return state.identity
        ? state
        : { phase: "error", identity: null, error: action.message };
  }
};

export function CloudKitAuthProvider({
  children,
  onSignedOut
}: {
  children: React.ReactNode;
  onSignedOut?: () => void | Promise<void>;
}) {
  const configuration = useMemo(() => getCloudKitConfigurationStatus(), []);
  const [state, dispatch] = useReducer(reduceCloudKitAuth, initialState);
  const refreshPromiseRef = useRef<Promise<CloudKitUserIdentity | null> | null>(null);
  const identityRef = useRef<CloudKitUserIdentity | null>(null);
  const authEpochRef = useRef(0);
  const signInAttemptStartedAtRef = useRef<number | null>(null);

  const acceptSignedIn = useCallback((identity: CloudKitUserIdentity) => {
    authEpochRef.current += 1;
    signInAttemptStartedAtRef.current = null;
    identityRef.current = identity;
    noteCloudKitSignedIn(identity);
    dispatch({ type: "signed-in", identity });
  }, []);

  const acceptSignedOut = useCallback(() => {
    authEpochRef.current += 1;
    signInAttemptStartedAtRef.current = null;
    identityRef.current = null;
    disarmCloudKitSignInMessageGuard();
    forgetCloudKitIdentity();
    dispatch({ type: "signed-out" });
    void onSignedOut?.();
  }, [onSignedOut]);

  const refresh = useCallback(async () => {
    if (!configuration.configured) {
      dispatch({ type: "error", message: "CloudKit is not configured." });
      return null;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    dispatch({ type: "checking" });
    const refreshEpoch = authEpochRef.current;
    refreshPromiseRef.current = setUpCloudKitAuth()
      .then((identity) => {
        // A popup sign-in/sign-out event is more authoritative than an older
        // setUpAuth() request that finishes later. Return the current identity
        // to callers instead of reviving stale auth state.
        if (refreshEpoch !== authEpochRef.current) {
          return identityRef.current;
        }

        if (identity) {
          signInAttemptStartedAtRef.current = null;
          identityRef.current = identity;
          dispatch({ type: "signed-in", identity });
          return identity;
        }

        // A sign-in event is authoritative. A shortly delayed setUpAuth()
        // response must not clear the identity delivered by that event.
        if (identityRef.current) {
          return identityRef.current;
        }

        const signInAttemptStartedAt = signInAttemptStartedAtRef.current;
        if (signInAttemptStartedAt !== null) {
          if (Date.now() - signInAttemptStartedAt < SIGN_IN_RECONCILE_GRACE_MS) {
            dispatch({ type: "signing-in" });
            return null;
          }

          signInAttemptStartedAtRef.current = null;
          dispatch({
            type: "error",
            message: "Apple ID sign-in did not complete. Try again."
          });
          return null;
        }

        dispatch({ type: "signed-out" });
        void onSignedOut?.();
        return null;
      })
      .catch((error: unknown) => {
        if (refreshEpoch !== authEpochRef.current) {
          return identityRef.current;
        }
        signInAttemptStartedAtRef.current = null;
        dispatch({
          type: "error",
          message: error instanceof Error ? error.message : "Apple ID sign-in failed."
        });
        return null;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });

    return refreshPromiseRef.current;
  }, [configuration.configured, onSignedOut]);

  const noteSignInStarted = useCallback(() => {
    // Invalidate any pre-popup setUpAuth() response so a delayed null cannot
    // overwrite the sign-in event that follows. Also drop the cached identity:
    // the attempt may switch to a different Apple account.
    authEpochRef.current += 1;
    signInAttemptStartedAtRef.current = Date.now();
    forgetCloudKitIdentity();
    dispatch({ type: "signing-in" });
  }, []);

  useEffect(() => {
    if (!configuration.configured) {
      dispatch({ type: "error", message: "CloudKit is not configured." });
      return;
    }

    let active = true;
    const refreshTimeouts = new Set<number>();

    const scheduleListener = (listener: () => void, delay: number) => {
      const timeout = window.setTimeout(() => {
        refreshTimeouts.delete(timeout);
        if (active) {
          listener();
        }
      }, delay);
      refreshTimeouts.add(timeout);
    };

    const listenForSignIn = () => {
      void whenCloudKitUserSignsIn()
        .then((identity) => {
          if (active) {
            acceptSignedIn(identity);
            scheduleListener(listenForSignIn, 0);
          }
        })
        .catch((error: unknown) => {
          if (active) {
            // The SDK settled this attempt with a failure; stop filtering
            // window messages for it.
            disarmCloudKitSignInMessageGuard();
            if (signInAttemptStartedAtRef.current !== null) {
              signInAttemptStartedAtRef.current = null;
              authEpochRef.current += 1;
              dispatch({
                type: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Apple ID sign-in failed."
              });
            } else {
              void refresh();
            }
            scheduleListener(listenForSignIn, 1000);
          }
        });
    };

    const listenForSignOut = () => {
      void whenCloudKitUserSignsOut()
        .then(() => {
          if (active) {
            acceptSignedOut();
            scheduleListener(listenForSignOut, 0);
          }
        })
        .catch(() => {
          if (active) {
            void refresh();
            scheduleListener(listenForSignOut, 1000);
          }
        });
    };

    const scheduleRefresh = (delay: number) => {
      const timeout = window.setTimeout(() => {
        refreshTimeouts.delete(timeout);
        if (active) {
          void refresh();
        }
      }, delay);
      refreshTimeouts.add(timeout);
    };
    const reconcileAfterPopup = () => {
      if (signInAttemptStartedAtRef.current !== null) {
        scheduleRefresh(150);
        scheduleRefresh(1_200);
        scheduleRefresh(SIGN_IN_RECONCILE_GRACE_MS + 250);
        return;
      }

      if (identityRef.current) {
        // One cheap revalidation so an Apple session that expired remotely
        // still locks the workspace promptly after the user returns.
        scheduleRefresh(1_200);
        return;
      }

      // Idle and signed out: whenUserSignsIn and CloudKit's own background
      // poll already cover state changes. Extra setUpAuth calls here only
      // multiply CloudKit JS's internal sign-in polling chains and re-render
      // the sign-in button while a popup may be pending.
    };
    const reconcileWhenVisible = () => {
      if (document.visibilityState === "visible") {
        reconcileAfterPopup();
      }
    };

    window.addEventListener("focus", reconcileAfterPopup);
    document.addEventListener("visibilitychange", reconcileWhenVisible);
    listenForSignIn();
    listenForSignOut();
    void refresh();

    return () => {
      active = false;
      window.removeEventListener("focus", reconcileAfterPopup);
      document.removeEventListener("visibilitychange", reconcileWhenVisible);
      refreshTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      refreshTimeouts.clear();
    };
  }, [acceptSignedIn, acceptSignedOut, configuration.configured, refresh]);

  const value = useMemo<CloudKitAuthContextValue>(
    () => ({
      ...state,
      configured: configuration.configured,
      refresh,
      noteSignInStarted
    }),
    [configuration.configured, noteSignInStarted, refresh, state]
  );

  return (
    <CloudKitAuthContext.Provider value={value}>
      {children}
    </CloudKitAuthContext.Provider>
  );
}

export function useCloudKitAuth() {
  const context = useContext(CloudKitAuthContext);
  if (!context) {
    throw new Error("useCloudKitAuth must be used inside CloudKitAuthProvider");
  }
  return context;
}
