import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  loading: boolean;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, totalPages, loading, onPageChange }: PaginationControlsProps) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-3 text-sm">
      <Button type="button" variant="outline" size="sm" disabled={loading || page <= 1} onClick={() => onPageChange(page - 1)}>
        Précédent
      </Button>
      <span>Page {page} / {totalPages}</span>
      <Button type="button" variant="outline" size="sm" disabled={loading || page >= totalPages} onClick={() => onPageChange(page + 1)}>
        Suivant
      </Button>
    </nav>
  );
}
