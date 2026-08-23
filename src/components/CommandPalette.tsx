import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BookOpen,
  GraduationCap,
  Sparkles,
  Layers,
  Compass,
  FileCode,
  Search,
  Bot,
  Map,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { REFERENCE_DOCS } from "@/lib/reference-docs";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const runCommand = (command: () => void) => {
    setOpen(false);
    command();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search across Microsoft Fabric..." />
      <CommandList>
        <CommandEmpty>No matching results found.</CommandEmpty>

        <CommandGroup heading="Reference Docs & Whitepapers">
          {REFERENCE_DOCS.map((doc) => (
            <CommandItem
              key={doc.slug}
              value={`${doc.title} ${doc.capabilities.join(" ")}`}
              onSelect={() =>
                runCommand(() => navigate({ to: "/docs/$slug", params: { slug: doc.slug } }))
              }
              className="flex items-center gap-2"
            >
              <BookOpen className="h-4 w-4 text-teal-500" />
              <div className="flex flex-col">
                <span>{doc.title}</span>
                <span className="text-[11px] text-muted-foreground line-clamp-1">
                  {doc.subtitle}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem
            value="learn portal curriculum paths"
            onSelect={() => runCommand(() => navigate({ to: "/learn" }))}
            className="flex items-center gap-2"
          >
            <GraduationCap className="h-4 w-4 text-primary" />
            <span>Learn Portal &amp; Structured Curriculum</span>
          </CommandItem>
          <CommandItem
            value="reference docs deep dives"
            onSelect={() => runCommand(() => navigate({ to: "/docs" }))}
            className="flex items-center gap-2"
          >
            <BookOpen className="h-4 w-4 text-teal-500" />
            <span>Reference Docs Library</span>
          </CommandItem>
          <CommandItem
            value="capability registry"
            onSelect={() => runCommand(() => navigate({ to: "/registry" }))}
            className="flex items-center gap-2"
          >
            <Layers className="h-4 w-4 text-amber-500" />
            <span>Capability Registry</span>
          </CommandItem>
          <CommandItem
            value="solution designs architectures blueprints"
            onSelect={() => runCommand(() => navigate({ to: "/designs" }))}
            className="flex items-center gap-2"
          >
            <FileCode className="h-4 w-4 text-purple-500" />
            <span>Architectural Blueprints</span>
          </CommandItem>
          <CommandItem
            value="fabric roadmap items"
            onSelect={() => runCommand(() => navigate({ to: "/roadmap" }))}
            className="flex items-center gap-2"
          >
            <Map className="h-4 w-4 text-blue-500" />
            <span>Fabric Feature Roadmap</span>
          </CommandItem>
          <CommandItem
            value="fabric advisor ai"
            onSelect={() => runCommand(() => navigate({ to: "/advisor" }))}
            className="flex items-center gap-2"
          >
            <Bot className="h-4 w-4 text-rose-500" />
            <span>Fabric AI Advisor</span>
          </CommandItem>
          <CommandItem
            value="global search"
            onSelect={() => runCommand(() => navigate({ to: "/search" }))}
            className="flex items-center gap-2"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span>Knowledge Base Search</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
