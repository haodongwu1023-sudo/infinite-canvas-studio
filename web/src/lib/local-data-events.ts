const listeners = new Set<() => void>();

export function notifyLocalDataSaved() {
    listeners.forEach((listener) => listener());
}

export function subscribeLocalDataSaved(listener: () => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
