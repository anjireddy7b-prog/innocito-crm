import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Briefcase, Building2, Linkedin, MapPin, Pencil, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { LeadStatusBadge } from '@/components/shared/StatusBadge';
import { useContact, useDeleteContact } from '@/api/contacts';
import { useAuthStore } from '@/store/authStore';
import { PERMISSIONS } from '@/lib/permissions';
import { formatCurrency, initials } from '@/lib/utils';
import { ContactFormDialog } from '@/pages/contacts/ContactFormDialog';

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: contact, isLoading } = useContact(id);
  const deleteContact = useDeleteContact();
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  if (isLoading || !contact) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const canManage = hasPermission(PERMISSIONS.CONTACTS_MANAGE);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/contacts" className="inline-flex items-center gap-1 hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Contacts
        </Link>
      </div>

      <PageHeader
        title={`${contact.firstName} ${contact.lastName}`}
        description={contact.designation ?? undefined}
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
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <Avatar className="h-16 w-16 text-lg">
                <AvatarFallback>{initials(contact.firstName, contact.lastName)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{contact.firstName} {contact.lastName}</p>
                {contact.isPrimary && <Badge variant="outline" className="mt-1">Primary Contact</Badge>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Contact Details</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {contact.email && <p className="flex items-center gap-2 text-muted-foreground"><Mail className="h-3.5 w-3.5" /><a href={`mailto:${contact.email}`} className="hover:text-primary hover:underline">{contact.email}</a></p>}
              {contact.phone && <p className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{contact.phone}</p>}
              {contact.designation && <p className="flex items-center gap-2 text-muted-foreground"><Briefcase className="h-3.5 w-3.5" />{contact.designation}</p>}
              {contact.company && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" />
                  <Link to={`/companies/${contact.company.id}`} className="hover:text-primary hover:underline">{contact.company.name}</Link>
                </p>
              )}
              {contact.linkedinUrl && <p className="flex items-center gap-2 text-muted-foreground"><Linkedin className="h-3.5 w-3.5" /><a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="hover:text-primary hover:underline">LinkedIn</a></p>}
              {(contact.city || contact.state || contact.country) && (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {[contact.city, contact.state, contact.country].filter(Boolean).join(', ')}
                </p>
              )}
              {contact.notes && (
                <div className="pt-2">
                  <p className="text-xs font-medium text-muted-foreground">Notes</p>
                  <p className="whitespace-pre-wrap">{contact.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle>Leads ({contact.leads?.length ?? 0})</CardTitle></CardHeader>
            <CardContent>
              {contact.leads?.length ? (
                <div className="divide-y divide-border">
                  {contact.leads.map((l) => (
                    <div
                      key={l.id}
                      className="flex cursor-pointer items-center justify-between py-3 hover:bg-muted/50"
                      onClick={() => navigate(`/leads/${l.id}`)}
                    >
                      <div>
                        <p className="font-mono text-xs text-muted-foreground">{l.displayId}</p>
                        <p className="font-medium">{l.company?.name ?? 'Lead'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{formatCurrency(l.dealValue, l.currency)}</span>
                        <LeadStatusBadge status={l.status} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState title="No leads yet" description="Leads involving this contact will appear here." />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ContactFormDialog contact={contact} open={editOpen} onOpenChange={setEditOpen} />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this contact?"
        description="This cannot be undone."
        destructive
        confirmLabel="Delete Contact"
        loading={deleteContact.isPending}
        onConfirm={() =>
          deleteContact.mutate(contact.id, {
            onSuccess: () => {
              toast.success('Contact deleted');
              navigate('/contacts');
            },
          })
        }
      />
    </div>
  );
}
