import { authGitlab, autocompleteProject, findIssues } from "./gitlab";

interface GitlabRecord extends Aha.ImportRecord {
  description: string;
}

const importer = aha.getImporter<GitlabRecord>(
  "aha-develop.gitlab-import.gitlab"
);

importer.on(
  { action: "listFilters" },
  async (): Promise<Aha.ListFilters> => {
    authGitlab();

    return {
      project: {
        title: "Project",
        required: true,
        type: "autocomplete",
      },
    };
  }
);

importer.on({ action: "filterValues" }, async ({ filterName, filters }) => {
  let values: Aha.FilterValue[] = [];

  switch (filterName) {
    case "project":
      values = await autocompleteProject(filters[filterName]);
  }

  return values;
});

importer.on({ action: "listCandidates" }, async ({ filters, nextPage }) => {
  if (!filters.project) return { records: [], nextPage };

  const page = await findIssues(filters.project, nextPage);
  const records = page.records.map<GitlabRecord>((issue) => ({
    name: issue.title,
    uniqueId: issue.id,
    identifier: issue.iid,
    url: issue.webUrl,
    description: issue.descriptionHtml,
  }));

  return {
    records,
    nextPage: page.endCursor,
  };
});

importer.on({ action: "importRecord" }, async ({ importRecord, ahaRecord }) => {
  (ahaRecord as any).description = `${importRecord.description}<p><a href='${importRecord.url}'>View on GitLab</a></p>`;
  await ahaRecord.save();
});
