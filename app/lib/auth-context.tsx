import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@simplepasskey/browser";
import { Effect } from "effect";
import { AuthService } from "~/lib/auth-service";
import { AppRuntime } from "~/lib/effect-runtime";

interface AuthState {
  isAuthenticated: boolean;
  session: Session | null;
  isLoading: boolean;
}

const defaultState: AuthState = {
  isAuthenticated: false,
  session: null,
  isLoading: false,
};

const AuthContext = createContext<AuthState>(defaultState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    session: null,
    isLoading: true,
  });

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    // Check initial auth state
    const init = Effect.gen(function* () {
      const auth = yield* AuthService;
      const authenticated = yield* auth.isAuthenticated();
      let session: Session | null = null;
      if (authenticated) {
        session = yield* auth.getSession();
      }
      return { authenticated, session };
    });

    AppRuntime.runPromise(init)
      .then(({ authenticated, session }) => {
        setState({
          isAuthenticated: authenticated,
          session,
          isLoading: false,
        });
      })
      .catch(() => {
        setState({ isAuthenticated: false, session: null, isLoading: false });
      });

    // Subscribe to auth changes
    const subscribe = AuthService.pipe(
      Effect.andThen((auth) =>
        auth.onAuthChange((session) => {
          setState({
            isAuthenticated: session !== null && !session.isExpired,
            session,
            isLoading: false,
          });
        }),
      ),
    );

    AppRuntime.runPromise(subscribe)
      .then((unsub) => {
        unsubscribe = unsub;
      })
      .catch(console.error);

    return () => {
      unsubscribe?.();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
