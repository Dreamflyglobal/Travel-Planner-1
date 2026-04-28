export const API_CONFIG = {
  BASE_URL: import.meta.env.VITE_API_BASE_URL ?? "",
  HEALTH_CHECK_TIMEOUT: 2000,
};

export async function checkBackendAvailability(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${API_CONFIG.BASE_URL}/api/healthz`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}
