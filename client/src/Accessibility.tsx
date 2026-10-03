import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, Settings2 } from "lucide-react";

type DisplayPreferences = { largeText: boolean; highContrast: boolean };
function readDisplay(): DisplayPreferences {
  try {
    const saved = JSON.parse(localStorage.getItem("echoguide.display") ?? "{}");
    return {
      largeText: saved.largeText === true,
      highContrast: saved.highContrast === true,
    };
  } catch {
    return { largeText: false, highContrast: false };
  }
}

export function DisplayTools() {
  const [display, setDisplay] = useState(readDisplay);
  useLayoutEffect(() => {
    document.documentElement.dataset.largeText = String(display.largeText);
    document.documentElement.dataset.highContrast = String(
      display.highContrast,
    );
    try {
      localStorage.setItem("echoguide.display", JSON.stringify(display));
    } catch {
      /* Session remains usable. */
    }
  }, [display]);
  return (
    <details className="display-tools">
      <summary>
        <Settings2 aria-hidden="true" size={20} /> Display settings
      </summary>
      <div className="display-options">
        <label>
          <input
            type="checkbox"
            checked={display.largeText}
            onChange={(e) =>
              setDisplay({ ...display, largeText: e.target.checked })
            }
          />{" "}
          Larger text
        </label>
        <label>
          <input
            type="checkbox"
            checked={display.highContrast}
            onChange={(e) =>
              setDisplay({ ...display, highContrast: e.target.checked })
            }
          />{" "}
          High contrast
        </label>
        <span>
          <Eye aria-hidden="true" size={18} /> Settings stay on this device.
        </span>
      </div>
    </details>
  );
}

export function RouteFocus() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useLayoutEffect(() => {
    const heading = document.querySelector("main h1");
    document.title = `EchoGuide · ${heading?.textContent ?? "Object awareness"}`;
    if (previous.current !== pathname) {
      document.querySelector<HTMLElement>("#main-content")?.focus();
      window.scrollTo(0, 0);
    }
    previous.current = pathname;
  }, [pathname]);
  return null;
}
