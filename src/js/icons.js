// Official marks. X: the X logo mark (24 grid). GitHub: Octicon mark-github (16 grid).
export const X_PATH = 'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z';
export const GITHUB_PATH = 'M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z';

export const X_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="${X_PATH}"/></svg>`;
export const GITHUB_SVG = `<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false"><path fill="currentColor" d="${GITHUB_PATH}"/></svg>`;

const stroke = (d) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const ICON = {
  copy: stroke('<rect x="5.5" y="5.5" width="8" height="8"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2"/>'),
  check: stroke('<path d="M3 8.5l3.2 3.2L13 4.8"/>'),
  overview: stroke('<path d="M2.5 7.2L8 2.5l5.5 4.7V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5z"/>'),
  board: stroke('<path d="M3 13V8M8 13V3M13 13V6"/>'),
  token: stroke('<circle cx="8" cy="8" r="5.5"/><path d="M5.5 9.5L8 6l2.5 3.5"/>'),
  flow: stroke('<path d="M2.5 5.5h10M10 3l2.5 2.5L10 8M13.5 10.5h-10M6 8l-2.5 2.5L6 13"/>'),
  plan: stroke('<path d="M3 4h10M3 8h10M3 12h6"/>'),
  arrow: stroke('<path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5"/>'),
  menu: stroke('<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>'),
  close: stroke('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/>'),
};
