import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs.tsx";

/** Notes is the only workspace; the tab names the panel and is its header anchor. */
export function WorkspaceNavigation() {
    return (
        <Tabs className="workspace-switcher" value="documents">
            <TabsList aria-label="工作区导航">
                <TabsTrigger
                    value="documents"
                    data-workspace="documents"
                    aria-label="笔记工作区"
                >
                    笔记
                </TabsTrigger>
            </TabsList>
        </Tabs>
    );
}
