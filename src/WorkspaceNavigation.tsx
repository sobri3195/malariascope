import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import './workspace-navigation.css';
/** Query-only context updates preserve focus and scroll; lazy route changes wait for actual content. */
export default function WorkspaceNavigation() {
  const { pathname } = useLocation();
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    let frame = 0;
    const focusContent = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const heading = [...document.querySelectorAll<HTMLElement>('main h1, header h1, h1')].find(
          (node) =>
            node.getClientRects().length && !node.closest('[role="status"], [aria-hidden="true"]'),
        );
        if (!heading || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
        const editing = document.activeElement?.matches(
          'input, select, textarea, [contenteditable="true"]',
        );
        if (!editing) {
          heading.tabIndex = -1;
          heading.focus({ preventScroll: true });
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
        setAnnouncement(`${heading.textContent?.trim() || 'Workspace'} page opened`);
        observer.disconnect();
      });
    };
    const observer = new MutationObserver(focusContent);
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
    focusContent();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [pathname]);
  return (
    <div
      className="workspace-route-announcement"
      role="status"
      aria-label="Page navigation announcement"
      aria-live="polite"
      aria-atomic="true"
    >
      {announcement}
    </div>
  );
}
