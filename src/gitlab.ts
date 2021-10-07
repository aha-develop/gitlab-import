import { gql, GraphQLClient } from "graphql-request";

const ENDPOINT = "https://gitlab.com/api/graphql";

export async function authGitlab() {
  return await aha.auth("gitlab", { useCachedRetry: true });
}

/**
 * Create an authenticated graphql fetch function
 *
 * ```
 * const api = await gitlabGraphql();
 * await api(GraphqlQuery, {variables});
 * ```
 */
export async function gitlabGraphql() {
  const authData = await authGitlab();
  const client = new GraphQLClient(ENDPOINT, {
    headers: {
      Authorization: `Bearer ${authData.token}`,
    },
  });

  const request = <T>(...args: Parameters<GraphQLClient["request"]>) => {
    return client.request<T>(...args);
  };

  return request;
}

interface ProjectFragment {
  id: string;
  name: string;
  fullPath: string;
}

const ProjectFragment = gql`
  fragment ProjectFragment on Project {
    id
    name
    fullPath
  }
`;

type ProjectMemberships = {
  currentUser: {
    projectMemberships: { nodes: { project: ProjectFragment }[] };
  };
};

const ProjectMemberships = gql`
  query ProjectMemberships($limit: Int!) {
    currentUser {
      projectMemberships(first: $limit) {
        nodes {
          project {
            ...ProjectFragment
          }
        }
      }
    }
  }

  ${ProjectFragment}
`;

type SearchProjects = { projects: { nodes: ProjectFragment[] } };

const SearchProjects = gql`
  query SearchProjects($term: String!, $limit: Int!) {
    projects(membership: true, search: $term, first: $limit) {
      nodes {
        ...ProjectFragment
      }
    }
  }

  ${ProjectFragment}
`;

interface ProjectIssueEdge {
  cursor: string;
  node: {
    id: string;
    iid: string;
    title: string;
    descriptionHtml: string;
    webUrl: string;
  };
}

type ProjectIssues = {
  project: {
    issues: {
      edges: ProjectIssueEdge[];
      pageInfo: { endCursor: string };
    };
  };
};

const ProjectIssues = gql`
  query ProjectIssues($path: ID!, $cursor: String) {
    project(fullPath: $path) {
      issues(first: 20, after: $cursor) {
        edges {
          cursor
          node {
            id
            iid
            title
            descriptionHtml
            webUrl
          }
        }
        pageInfo {
          endCursor
        }
      }
    }
  }
`;

/**
 * Search for projects by query from the current users memberships
 */
export async function autocompleteProject(
  query: string
): Promise<Aha.FilterValue[]> {
  const api = await gitlabGraphql();
  let projects: ProjectFragment[] = [];

  if (query.length === 0) {
    projects = (
      await api<ProjectMemberships>(ProjectMemberships, { limit: 30 })
    ).currentUser.projectMemberships.nodes.map((node) => node.project);
  } else {
    projects = (
      await api<SearchProjects>(SearchProjects, { term: query, limit: 30 })
    ).projects.nodes;
  }

  return projects.map((project) => ({
    text: project.name,
    value: project.fullPath,
  }));
}

/**
 * Find issues in a given project
 */
export async function findIssues(projectPath: string, cursor?: string) {
  const api = await gitlabGraphql();
  const {
    project: { issues },
  } = await api<ProjectIssues>(ProjectIssues, {
    path: projectPath,
    cursor,
  });

  const records = issues.edges.map((edge) => edge.node);
  const endCursor = issues.pageInfo.endCursor;

  return { records, endCursor };
}

