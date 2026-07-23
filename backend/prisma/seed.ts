import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding...');
  
  const user = await prisma.user.upsert({
    where: { login: 'demo-user' },
    update: {},
    create: {
      login: 'demo-user',
      name: 'Demo User',
      email: 'demo@example.com',
    },
  });
  console.log(`Created/updated user with id: ${user.id}`);

  const session = await prisma.workspaceSession.upsert({
    where: { id: 'seed-session-123' },
    update: {},
    create: {
      id: 'seed-session-123',
      owner: 'demo',
      repo: 'course-demo',
      branch: 'main',
      repoPath: '/tmp/repos/demo/course-demo',
      outputPath: '/tmp/output/seed-session-123',
      creatorId: user.id,
      creatorLogin: 'demo-user',
    },
  });
  console.log(`Created/updated session with id: ${session.id}`);

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
