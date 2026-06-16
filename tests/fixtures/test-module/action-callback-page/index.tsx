import { Grid, PageGridCard, PageSearchFormCard, SearchForm } from 'procomponents';
import { useRowActions } from './hooks';
import { searchSchema, gridSchema } from './schema';

export default function ActionCallbackPage() {
  const { onDelete, onArchive, onPreview } = useRowActions(() => {});
  return (
    <>
      <PageSearchFormCard>
        <SearchForm schema={searchSchema} />
      </PageSearchFormCard>
      <PageGridCard>
        <Grid
          columns={gridSchema}
          context={{ onDelete, onArchive, onPreview }}
        />
      </PageGridCard>
    </>
  );
}
