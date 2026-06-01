export async function handleListProjects(
  projects: Array<{ id: string; name: string; docsPath: string }>
) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          projects.map((p) => ({ id: p.id, name: p.name })),
          null,
          2
        ),
      },
    ],
  };
}
