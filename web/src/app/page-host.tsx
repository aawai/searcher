import {
    type ComponentType,
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
} from "react";
import {
    Link,
    type LinkProps,
    type Location,
    type NavigateFunction,
    useLocation,
    useNavigate,
} from "react-router-dom";
import { MEDIA_QUERIES } from "../design-system/breakpoints.ts";

/** The owner supplies local navigation and a link implementation for this content. */
export interface PageHost {
    location: Location;
    navigate: NavigateFunction;
    Link: ComponentType<LinkProps>;
    narrow: boolean;
    active: boolean;
}

/** Adapter for the existing standalone pages; future hosts provide their own value. */
export function usePagePresenter(): PageHost {
    const location = useLocation();
    const navigate = useNavigate();
    const [narrow, setNarrow] = useState(() =>
        globalThis.matchMedia(MEDIA_QUERIES.belowMedium).matches
    );
    useEffect(() => {
        const media = globalThis.matchMedia(MEDIA_QUERIES.belowMedium);
        const change = () => setNarrow(media.matches);
        media.addEventListener("change", change);
        return () => media.removeEventListener("change", change);
    }, []);
    return { location, navigate, Link, narrow, active: true };
}

const PageHostContext = createContext<PageHost | null>(null);

/** Supplies the same local navigation and activity to nested feature content. */
export function PageHostProvider(
    { host, children }: { host: PageHost; children: ReactNode },
) {
    return <PageHostContext value={host}>{children}</PageHostContext>;
}

export function usePageHost(): PageHost {
    const host = useContext(PageHostContext);
    if (!host) throw new Error("PageHostProvider is required");
    return host;
}
