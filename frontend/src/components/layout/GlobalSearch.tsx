import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Building2, User, Megaphone, UserCog, LifeBuoy, BookOpen, Loader2 } from 'lucide-react';
import { useGlobalSearch } from '@/api/search';
import { cn } from '@/lib/utils';

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data, isFetching } = useGlobalSearch(query);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function go(path: string) {
    navigate(path);
    setOpen(false);
    setQuery('');
  }

  const hasResults =
    data &&
    (data.leads.length ||
      data.companies.length ||
      data.contacts.length ||
      data.campaigns.length ||
      data.salesReps.length ||
      data.cases.length ||
      data.knowledgeArticles.length);

  return (
    <div ref={containerRef} className="relative w-full max-w-xl">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search leads, companies, contacts, cases, articles…"
          className="h-9 w-full rounded-full border border-transparent bg-secondary/70 pl-9 pr-9 text-sm transition-all placeholder:text-muted-foreground focus-visible:border-ring/40 focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="glass-panel absolute left-0 right-0 top-12 z-50 max-h-[70vh] overflow-y-auto rounded-2xl border border-border/60 text-popover-foreground shadow-glass-lg duration-150 ease-apple animate-in fade-in-0 zoom-in-95 slide-in-from-top-1">
          {!hasResults && !isFetching && <p className="p-4 text-sm text-muted-foreground">No matches for “{query}”.</p>}

          {!!data?.leads.length && (
            <SearchSection title="Leads">
              {data.leads.map((l) => (
                <SearchRow key={l.id} icon={User} label={l.title} sublabel={`${l.displayId} · ${l.status.replace(/_/g, ' ')}`} onClick={() => go(`/leads/${l.id}`)} />
              ))}
            </SearchSection>
          )}
          {!!data?.companies.length && (
            <SearchSection title="Companies">
              {data.companies.map((c) => (
                <SearchRow key={c.id} icon={Building2} label={c.name} sublabel={[c.domain, c.country].filter(Boolean).join(' · ')} onClick={() => go(`/companies/${c.id}`)} />
              ))}
            </SearchSection>
          )}
          {!!data?.contacts.length && (
            <SearchSection title="Contacts">
              {data.contacts.map((c) => (
                <SearchRow key={c.id} icon={User} label={`${c.firstName} ${c.lastName}`} sublabel={[c.company?.name, c.email].filter(Boolean).join(' · ')} onClick={() => go(`/contacts/${c.id}`)} />
              ))}
            </SearchSection>
          )}
          {!!data?.campaigns.length && (
            <SearchSection title="Campaigns">
              {data.campaigns.map((c) => (
                <SearchRow key={c.id} icon={Megaphone} label={c.name} sublabel={c.code ?? undefined} onClick={() => go(`/campaigns/${c.id}`)} />
              ))}
            </SearchSection>
          )}
          {!!data?.salesReps.length && (
            <SearchSection title="Sales Representatives">
              {data.salesReps.map((u) => (
                <SearchRow key={u.id} icon={UserCog} label={`${u.firstName} ${u.lastName}`} sublabel={u.email} onClick={() => go(`/leads?assignedToId=${u.id}`)} />
              ))}
            </SearchSection>
          )}
          {!!data?.cases.length && (
            <SearchSection title="Cases">
              {data.cases.map((c) => (
                <SearchRow key={c.id} icon={LifeBuoy} label={c.subject} sublabel={`${c.displayId} · ${c.status.replace(/_/g, ' ')}`} onClick={() => go(`/cases/${c.id}`)} />
              ))}
            </SearchSection>
          )}
          {!!data?.knowledgeArticles.length && (
            <SearchSection title="Knowledge Base">
              {data.knowledgeArticles.map((a) => (
                <SearchRow key={a.id} icon={BookOpen} label={a.title} sublabel={[a.category, a.status === 'DRAFT' ? 'Draft' : null].filter(Boolean).join(' · ')} onClick={() => go(`/knowledge-base/${a.id}`)} />
              ))}
            </SearchSection>
          )}
        </div>
      )}
    </div>
  );
}

function SearchSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-1 last:border-b-0">
      <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function SearchRow({
  icon: Icon,
  label,
  sublabel,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sublabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'mx-2 flex w-[calc(100%-1rem)] items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate">
        <span className="font-medium">{label}</span>
        {sublabel && <span className="ml-2 text-xs text-muted-foreground">{sublabel}</span>}
      </span>
    </button>
  );
}
