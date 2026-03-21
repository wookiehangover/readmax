import { Layer, ManagedRuntime } from "effect"

/**
 * Application-wide layer that composes all service layers.
 * Add service layers here as they are created:
 *
 *   export const AppLayer = Layer.mergeAll(
 *     BookStoreLayer,
 *     SettingsLayer,
 *     ...
 *   )
 */
export const AppLayer = Layer.empty

/**
 * Shared ManagedRuntime for the application.
 * Use `AppRuntime.runPromise(effect)` or `AppRuntime.runSync(effect)`
 * at call sites to execute effects with all application services provided.
 */
export const AppRuntime = ManagedRuntime.make(AppLayer)

