import { useState } from "react";
import { ExternalLink, FileText, LogOut, Plus, Search } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  SidebarSeparator,
} from "@voltedge/ui";

import { websiteUrl } from "../env.ts";
import { usePath } from "../lib/router.ts";
import { useSession } from "../lib/session.tsx";
import { useInquiries } from "../lib/use-inquiries.ts";

export function AppSidebar() {
  const { signOut } = useSession();
  const path = usePath();
  const [query, setQuery] = useState("");
  const { requests, error } = useInquiries(query);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <a href="/" aria-label="Media room home" className="flex items-center gap-2 px-1 py-1.5">
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
          media room
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={path === "/request"}
                  tooltip="New request"
                  render={<a href="/request" />}
                >
                  <Plus />
                  <span>New request</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="py-0 group-data-[collapsible=icon]:hidden">
          <SidebarGroupContent>
            <div className="relative px-2 py-2">
              <Search className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
              <SidebarInput
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search your inquiries"
                aria-label="Search your previous inquiries"
                className="pl-8"
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Your inquiries</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {error ? (
                <p className="px-2 py-1.5 text-xs text-destructive">{error}</p>
              ) : requests === null ? (
                <>
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                  <SidebarMenuSkeleton showIcon />
                </>
              ) : requests.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  {query.trim() ? "No inquiries match that search." : "No inquiries yet."}
                </p>
              ) : (
                requests.map((request) => {
                  const href = `/requests/${request.reference}`;
                  return (
                    <SidebarMenuItem key={request.reference}>
                      <SidebarMenuButton
                        isActive={path === href}
                        tooltip={`${request.reference} · ${request.claim}`}
                        render={<a href={href} />}
                        className="h-auto items-start py-1.5"
                      >
                        <FileText className="mt-0.5" />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="w-full truncate font-mono text-[10px] text-muted-foreground">
                            {request.reference}
                          </span>
                          <span className="line-clamp-2 w-full text-xs leading-snug">
                            {request.claim}
                          </span>
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })
              )}
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={path === "/requests"}
                  tooltip="All my requests"
                  render={<a href="/requests" />}
                >
                  <span>All my requests</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
