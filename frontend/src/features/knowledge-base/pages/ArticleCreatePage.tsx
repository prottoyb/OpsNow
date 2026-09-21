import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ErrorState } from '../../../components/ui/ErrorState';
import { PageHeading } from '../../../components/ui/PageHeading';
import { Spinner } from '../../../components/ui/Spinner';
import { toApiError } from '../../../lib/api/errors';
import type { CreateArticleInput } from '../../../types/api';
import { ArticleForm } from '../components/ArticleForm';
import type { ArticleFormValues } from '../components/ArticleForm';
import { useCreateArticle, useKnowledgeBaseCategories } from '../useKnowledgeBase';

export function ArticleCreatePage() {
  const navigate = useNavigate();
  const categoriesQuery = useKnowledgeBaseCategories();
  const createArticle = useCreateArticle();
  const [serverMessages, setServerMessages] = useState<string[]>([]);

  function handleSubmit(values: ArticleFormValues) {
    setServerMessages([]);

    // A minimal body: `forbidNonWhitelisted` rejects anything the DTO does
    // not declare, and `categoryId` is omitted rather than sent empty. There
    // is no `status` field at all — a new article is always born Draft, and
    // sending the key would be a 400 (create) regardless of role.
    const input: CreateArticleInput = {
      title: values.title,
      content: values.content,
    };
    if (values.categoryId !== '') input.categoryId = values.categoryId;

    createArticle.mutate(input, {
      onSuccess: (article) => navigate(`/kb/${article.id}`),
      onError: (error) => setServerMessages(toApiError(error).messages),
    });
  }

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <PageHeading>New article</PageHeading>

      <p className="text-sm text-slate-600">
        New articles start as a draft. Only a team lead or administrator can
        publish one.
      </p>

      {categoriesQuery.isPending ? (
        <Spinner label="Loading categories" />
      ) : null}

      {categoriesQuery.isError ? (
        <ErrorState
          title="Could not load categories"
          messages={toApiError(categoriesQuery.error).messages}
          onRetry={() => void categoriesQuery.refetch()}
        />
      ) : null}

      {categoriesQuery.isSuccess ? (
        <ArticleForm
          initialValues={{ title: '', content: '', categoryId: '' }}
          categories={categoriesQuery.data}
          submitting={createArticle.isPending}
          serverMessages={serverMessages}
          submitLabel="Create article"
          onSubmit={handleSubmit}
          onCancel={() => navigate('/kb')}
        />
      ) : null}
    </section>
  );
}
