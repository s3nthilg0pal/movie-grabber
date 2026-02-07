import type { MediaType } from '@movie-grabber/shared';

export type ButtonState = 'idle' | 'loading' | 'success' | 'exists' | 'error';

const BUTTON_ID = 'movie-grabber-root';

const STYLES = `
  :host {
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .mg-container {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 2147483647;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
  }

  .mg-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    color: #fff;
    background: #2563eb;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .mg-button:hover {
    background: #1d4ed8;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.35);
  }

  .mg-button:active {
    transform: translateY(0);
  }

  .mg-button[data-state="loading"] {
    opacity: 0.8;
    cursor: wait;
    pointer-events: none;
  }

  .mg-button[data-state="success"] {
    background: #16a34a;
  }

  .mg-button[data-state="exists"] {
    background: #ca8a04;
  }

  .mg-button[data-state="error"] {
    background: #dc2626;
  }

  .mg-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: mg-spin 0.6s linear infinite;
  }

  @keyframes mg-spin {
    to { transform: rotate(360deg); }
  }

  .mg-icon {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
  }

  .mg-toast {
    background: #1e293b;
    color: #f1f5f9;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    max-width: 300px;
    line-height: 1.4;
    animation: mg-fade-in 0.2s ease;
  }

  @keyframes mg-fade-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: translateY(0); }
  }
`;

const ICONS: Record<ButtonState, string> = {
  idle: `<svg class="mg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>`,
  loading: `<div class="mg-spinner"></div>`,
  success: `<svg class="mg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
  exists: `<svg class="mg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>`,
  error: `<svg class="mg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
};

function getLabelText(state: ButtonState, type: MediaType): string {
  const target = type === 'movie' ? 'Radarr' : 'Sonarr';
  switch (state) {
    case 'idle':
      return `Add to ${target}`;
    case 'loading':
      return 'Adding...';
    case 'success':
      return 'Added!';
    case 'exists':
      return 'Already exists';
    case 'error':
      return 'Failed';
  }
}

export function injectButton(
  type: MediaType,
  onClick: () => void,
): {
  setState: (state: ButtonState, message?: string) => void;
  remove: () => void;
} {
  // Prevent duplicate injection
  if (document.getElementById(BUTTON_ID)) {
    document.getElementById(BUTTON_ID)!.remove();
  }

  // Shadow DOM host
  const host = document.createElement('div');
  host.id = BUTTON_ID;
  const shadow = host.attachShadow({ mode: 'closed' });

  // Styles
  const style = document.createElement('style');
  style.textContent = STYLES;
  shadow.appendChild(style);

  // Container
  const container = document.createElement('div');
  container.className = 'mg-container';

  // Toast (hidden by default)
  const toast = document.createElement('div');
  toast.className = 'mg-toast';
  toast.style.display = 'none';

  // Button
  const button = document.createElement('button');
  button.className = 'mg-button';
  button.dataset.state = 'idle';
  button.innerHTML = `${ICONS.idle}<span>${getLabelText('idle', type)}</span>`;
  button.addEventListener('click', onClick);

  container.appendChild(toast);
  container.appendChild(button);
  shadow.appendChild(container);
  document.body.appendChild(host);

  function setState(state: ButtonState, message?: string) {
    button.dataset.state = state;
    button.innerHTML = `${ICONS[state]}<span>${getLabelText(state, type)}</span>`;

    if (message) {
      toast.textContent = message;
      toast.style.display = 'block';
      // Auto-hide toast after 5s
      setTimeout(() => {
        toast.style.display = 'none';
      }, 5000);
    } else {
      toast.style.display = 'none';
    }

    // Reset to idle after success/exists/error states
    if (state === 'success' || state === 'exists' || state === 'error') {
      setTimeout(() => {
        button.dataset.state = 'idle';
        button.innerHTML = `${ICONS.idle}<span>${getLabelText('idle', type)}</span>`;
      }, 4000);
    }
  }

  function remove() {
    host.remove();
  }

  return { setState, remove };
}
