// Shared by every service and the status panel to keep domain migrations consistent.
export const API_BASE_URL = 'https://api.rachg.com';
export const API_HOSTNAME = new URL(API_BASE_URL).hostname;
// Top-level navigation establishes the API host's Access cookie before returning.
export const API_CONNECT_URL = `${API_BASE_URL}/auth/return`;
