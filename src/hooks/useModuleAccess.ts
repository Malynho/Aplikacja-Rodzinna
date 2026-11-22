import { useFamily, type Level } from '../family/FamilyProvider'

// Access level of the current user to a module: admins always write, members use their permission row.
export function useModuleAccess(module: string): Level {
  const { role, permissions } = useFamily()
  if (role === 'admin') return 'write'
  return permissions[module] ?? 'none'
}
