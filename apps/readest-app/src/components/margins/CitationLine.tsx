import { formatCitation } from '@/services/margins/public/citation';
import type { PostView } from '@/services/margins/public/api';

interface CitationLineProps {
  citation: PostView['citation'];
  book: PostView['book'];
}

export const CitationLine: React.FC<CitationLineProps> = ({ citation, book }) => {
  const rest = formatCitation(citation, { title: null, author: book.author });
  return (
    <span>
      {book.title && <cite>{book.title}</cite>}
      {book.title && rest && ' · '}
      {rest}
    </span>
  );
};

export default CitationLine;
