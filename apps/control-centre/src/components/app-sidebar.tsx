import { ClipboardList, ExternalLink, LogOut, Newspaper, ShieldCheck } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@voltedge/ui";

import { websiteUrl } from "../lib/env.ts";
import { usePath } from "../lib/router.ts";
import { useSession } from "../lib/session.tsx";

export function AppSidebar() {
  const { session, signOut } = useSession();
  const path = usePath();
  const admin = session?.role === "Admin";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <a href="/" className="flex items-center gap-2 px-1 py-1.5">
          <img
            src="/statssa-arms-gray.webp"
            alt="Statistics South Africa"
            className="hidden size-8 shrink-0 object-contain group-data-[collapsible=icon]:block"
          />
          <img
            src="/statssa-logo.png"
            alt="Statistics South Africa"
            className="h-9 w-auto group-data-[collapsible=icon]:hidden"
          />
        </a>
        <span className="px-2 font-mono text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
          control centre
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>POPIA</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={path !== "/media"}
                  tooltip="Case queue"
                  render={<a href="/" />}
                >
                  <ClipboardList />
                  <span>Case queue</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Media</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={path === "/media"}
                  tooltip="Fact-check queue"
                  render={<a href="/media" />}
                >
                  <Newspaper />
                  <span>Fact-check queue</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {admin ? (
          <SidebarGroup>
            <SidebarGroupLabel>AI Governance</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={path === "/ai"}
                    tooltip="Telemetry"
                    render={<a href="/ai" />}
                  >
                    <ShieldCheck />
                    <span>Telemetry</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Public site" render={<a href={websiteUrl()} />}>
              <ExternalLink />
              <span>Public site</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sign out" onClick={() => void signOut()}>
              <LogOut />
              <span>Sign out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
