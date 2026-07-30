import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Globe2, Phone, MapPin, Pencil, Trash2, Linkedin } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { LeadStatusBadge } from '@/components/shared/StatusBadge';
import { useCompany, useDeleteCompany } from '@/api/companies';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatCurrency, formatDate } from '@/lib/utils';
import { CompanyFormDialog } from '@/pages/companies/CompanyFormDialog';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: company, isLoading } = useCompany(id);
  const deleteCompany = useDeleteCompany();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !company) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const canManage = hasPermission(PERMISSIONS.COMPANIES_MANAGE);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/companies" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Companies
        </Link>
      </div>

      <PageHeader
        title={company.name}
        description={company.industry ?? undefined}
        actions={
          canManage && (
            <>
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil /> Edit
              </Button>
              <Button variant="outline" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="text-destructive" />
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-1">
          <Card>
            <CardHeader><CardTitle>Company Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {company.domain && <p className="flex items-center gap-2 text-muted-foreground"><Globe2 className="h-3.5 w-3.5" />{company.domain}</p>}
              {company.website && <p className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-3.5 w-3.5" /><a href={company.website} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">{company.website}</a></p>}
              {company.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{company.phone}</p>}
              {company.linkedinUrl && <p className="flex items-center gap-2 text-muted-foreground"><Linkedin className="h-3.5 w-3.5" /><a href={company.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">LinkedIn</a></p>}
              {(company.city || company.state || company.country) && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {[company.addressLine, company.city, company.state, company.country, company.postalCode].filter(Boolean).join(', ')}
                </p>
              )}
              {company.companySize && <div className="flex justify-between pt-2"><span className="text-muted-foreground">Company Size</span><span>{company.companySize}</span></div>}
              {company.annualRevenue && <div className="flex justify-between"><span className="text-muted-foreground">Annual Revenue</span><span>{formatCurrency(company.annualRevenue)}</span></div>}
              {company.notes && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{company.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contacts</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {company.contacts?.length ? (
                company.contacts.map((c) => (
                  <Link key={c.id} to={`/contacts/${c.id}`} className="flex items-center justify-between rounded-md p-2 hover:bg-muted">
                    <span>{c.firstName} {c.lastName}</span>
                    {c.designation && <span className="text-xs text-muted-foreground">{c.designation}</span>}
                  </Link>
                ))
              ) : (
                <p className="text-muted-foreground">No contacts linked yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Leads ({company._count?.leads ?? company.leads?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {company.leads?.length ? (
                <div className="divide-y divide-border">
                  {company.leads.map((l) => (
                    <div
                      key={l.id}
                      className="flex cursor-pointer items-center justify-between py-3 hover:bg-muted/50"
                      onClick={() => navigate(`/leads/${l.id}`)}
                    >
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{l.displayId}</p>
                        <p className="font-medium">{l.contact ? `${l.contact.firstName} ${l.contact.lastName}` : 'Lead'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{formatCurrency(l.dealValue, l.currency)}</span>
                        <LeadStatusBadge status={l.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No leads yet" description="Leads for this company will appear here." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <CompanyFormDialog company={company} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this company?"
        description="This cannot be undone. Leads and contacts linked to this company will remain but lose their company reference."
        destructive
        confirmLabel="Delete Company"
        loading={deleteCompany.isPending}
        onConfirm={() =>
          deleteCompany.mutate(company.id, {
            onSuccess: () => {
              toast.success('Company deleted');
              navigate('/companies');
            },
          })
        }
      />
    </div>
  );
}
