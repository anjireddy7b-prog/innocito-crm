import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssignableUsers } from '@/api/users';

interface UserPickerProps {
  value?: string | null;
  onChange: (value: string | null) => void;
  roles?: string[];
  placeholder?: string;
  allowUnassigned?: boolean;
}

export function UserPicker({ value, onChange, roles, placeholder = 'Select user…', allowUnassigned = true }: UserPickerProps) {
  const { data: users, isLoading } = useAssignableUsers(roles);

  return (
    <Select
      value={value ?? '__unassigned__'}
      onValueChange={(v) => onChange(v === '__unassigned__' ? null : v)}
      disabled={isLoading}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allowUnassigned && <SelectItem value="__unassigned__">Unassigned</SelectItem>}
        {users?.map((u) => (
          <SelectItem key={u.id} value={u.id}>
            {u.firstName} {u.lastName}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
