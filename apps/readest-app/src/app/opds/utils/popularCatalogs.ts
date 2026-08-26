import { OPDSCatalog } from '@/types/opds';

export interface PopularCatalogGroup {
  title: string;
  catalogs: OPDSCatalog[];
}

export const POPULAR_CATALOG_GROUPS: PopularCatalogGroup[] = [
  {
    title: 'Classics & Digital Libraries',
    catalogs: [
      {
        id: 'gutenberg',
        name: 'Project Gutenberg',
        url: 'https://m.gutenberg.org/ebooks.opds/',
        description: "World's largest collection of free ebooks",
        icon: '🏛️',
      },
      {
        id: 'standardebooks',
        name: 'Standard Ebooks',
        url: 'https://standardebooks.org/feeds/opds',
        description: 'Free and liberated ebooks, carefully produced for the true book lover',
        icon: '📚',
      },
      {
        id: 'manybooks',
        name: 'ManyBooks',
        url: 'https://manybooks.net/opds/index.php',
        description: 'Over 50,000 free ebooks',
        icon: '📖',
      },
      {
        id: 'unglue.it',
        name: 'Unglue.it',
        url: 'https://unglue.it/api/opds/',
        description: 'Free ebooks from authors who have "unglued" their books',
        icon: '🔓',
      },
      {
        id: 'internetarchive',
        name: 'Internet Archive',
        url: 'https://archive.org/services/opds',
        description: 'Millions of digitized books from the Internet Archive',
        icon: '🗄️',
      },
      {
        id: 'openlibrary',
        name: 'Open Library',
        url: 'https://openlibrary.org/opds',
        description: 'An open, editable library catalog with borrowable books',
        icon: '📗',
      },
    ],
  },
  {
    title: 'World Literature',
    catalogs: [
      {
        id: 'gallica',
        name: 'Gallica (BnF)',
        url: 'https://gallica.bnf.fr/opds',
        description: 'Digitized collections of the National Library of France',
        icon: '📜',
      },
      {
        id: 'wolnelektury',
        name: 'Wolne Lektury',
        url: 'https://wolnelektury.pl/opds/',
        description: 'Polish classics and school readings, freely available',
        icon: '📕',
      },
      {
        id: 'ebooksgratuits',
        name: 'Ebooks gratuits',
        url: 'https://www.ebooksgratuits.com/opds/',
        description: 'Free French-language ebooks',
        icon: '📘',
      },
      {
        id: 'textosinfo',
        name: 'textos.info',
        url: 'https://www.textos.info/opds',
        description: 'Free Spanish-language books and classics',
        icon: '📙',
      },
    ],
  },
];
