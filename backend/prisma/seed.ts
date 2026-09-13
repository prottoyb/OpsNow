import {
  AssetStatus,
  CommentVisibility,
  KnowledgeArticleStatus,
  NotificationType,
  PrismaClient,
  Role,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'DevPassword123!';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

async function resetData() {
  // Deleted in FK-dependency order so this seed can be re-run safely.
  await prisma.notification.deleteMany();
  await prisma.ticketKnowledgeArticle.deleteMany();
  await prisma.ticketAsset.deleteMany();
  await prisma.knowledgeBaseArticleFeedback.deleteMany();
  await prisma.knowledgeBaseArticle.deleteMany();
  await prisma.knowledgeBaseCategory.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticketHistory.deleteMany();
  await prisma.ticketSla.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.ticketCategory.deleteMany();
  await prisma.assetAssignment.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.assetType.deleteMany();
  await prisma.slaPolicy.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await resetData();

  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  // ---------------------------------------------------------------------
  // Users — one of each role, realistic names
  // ---------------------------------------------------------------------
  const [admin, teamLead, agent1, agent2, employee1, employee2, employee3] =
    await Promise.all([
      prisma.user.create({
        data: { email: 'admin@opsnow.local', passwordHash, firstName: 'Amelia', lastName: 'Ng', role: Role.Administrator },
      }),
      prisma.user.create({
        data: { email: 'teamlead@opsnow.local', passwordHash, firstName: 'Daniel', lastName: 'Osei', role: Role.TeamLead },
      }),
      prisma.user.create({
        data: { email: 'agent1@opsnow.local', passwordHash, firstName: 'Priya', lastName: 'Shah', role: Role.SupportAgent },
      }),
      prisma.user.create({
        data: { email: 'agent2@opsnow.local', passwordHash, firstName: 'Marco', lastName: 'Rossi', role: Role.SupportAgent },
      }),
      prisma.user.create({
        data: { email: 'employee1@opsnow.local', passwordHash, firstName: 'Grace', lastName: 'Kim', role: Role.Employee },
      }),
      prisma.user.create({
        data: { email: 'employee2@opsnow.local', passwordHash, firstName: 'Liam', lastName: 'Walsh', role: Role.Employee },
      }),
      prisma.user.create({
        data: { email: 'employee3@opsnow.local', passwordHash, firstName: 'Sofia', lastName: 'Torres', role: Role.Employee },
      }),
    ]);

  // ---------------------------------------------------------------------
  // Ticket categories (hierarchical)
  // ---------------------------------------------------------------------
  const hardware = await prisma.ticketCategory.create({ data: { name: 'Hardware' } });
  const software = await prisma.ticketCategory.create({ data: { name: 'Software' } });
  const network = await prisma.ticketCategory.create({ data: { name: 'Network' } });
  const accessRequest = await prisma.ticketCategory.create({ data: { name: 'Access Request' } });
  const laptopCategory = await prisma.ticketCategory.create({ data: { name: 'Laptop', parentId: hardware.id } });
  await prisma.ticketCategory.create({ data: { name: 'Desktop', parentId: hardware.id } });
  const businessApps = await prisma.ticketCategory.create({ data: { name: 'Business Applications', parentId: software.id } });
  await prisma.ticketCategory.create({ data: { name: 'Operating System', parentId: software.id } });

  // ---------------------------------------------------------------------
  // Asset types & assets
  // ---------------------------------------------------------------------
  const [laptopType, desktopType, monitorType, phoneType] = await Promise.all([
    prisma.assetType.create({ data: { name: 'Laptop' } }),
    prisma.assetType.create({ data: { name: 'Desktop' } }),
    prisma.assetType.create({ data: { name: 'Monitor' } }),
    prisma.assetType.create({ data: { name: 'Phone' } }),
  ]);
  await prisma.assetType.create({ data: { name: 'Peripheral' } });
  await prisma.assetType.create({ data: { name: 'Software License' } });

  const laptop1 = await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0001', name: 'Dell Latitude 5440', assetTypeId: laptopType.id, status: AssetStatus.Assigned, serialNumber: 'DL5440-0001', currentAssigneeId: employee1.id },
  });
  await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0002', name: 'Dell Latitude 5440', assetTypeId: laptopType.id, status: AssetStatus.InStock, serialNumber: 'DL5440-0002' },
  });
  await prisma.asset.create({
    data: { assetTag: 'DESKTOP-0001', name: 'HP EliteDesk 800', assetTypeId: desktopType.id, status: AssetStatus.Assigned, serialNumber: 'HP800-0001', currentAssigneeId: employee2.id },
  });
  const monitor1 = await prisma.asset.create({
    data: { assetTag: 'MONITOR-0001', name: 'Dell 24" Monitor', assetTypeId: monitorType.id, status: AssetStatus.Assigned, currentAssigneeId: employee1.id },
  });
  const phone1 = await prisma.asset.create({
    data: { assetTag: 'PHONE-0001', name: 'iPhone 13', assetTypeId: phoneType.id, status: AssetStatus.InRepair, serialNumber: 'IP13-0001' },
  });

  await prisma.assetAssignment.create({
    data: { assetId: laptop1.id, assignedToId: employee1.id, assignedById: admin.id, assignedAt: daysAgo(120) },
  });
  await prisma.assetAssignment.create({
    data: { assetId: monitor1.id, assignedToId: employee1.id, assignedById: admin.id, assignedAt: daysAgo(120) },
  });
  await prisma.assetAssignment.create({
    data: { assetId: phone1.id, assignedToId: employee3.id, assignedById: admin.id, assignedAt: daysAgo(200), returnedAt: daysAgo(2) },
  });

  // ---------------------------------------------------------------------
  // SLA policies — one active policy per priority (required invariant)
  // ---------------------------------------------------------------------
  const slaByPriority = {
    [TicketPriority.Critical]: await prisma.slaPolicy.create({ data: { name: 'Critical SLA', priority: TicketPriority.Critical, responseTimeMinutes: 15, resolutionTimeMinutes: 120 } }),
    [TicketPriority.High]: await prisma.slaPolicy.create({ data: { name: 'High SLA', priority: TicketPriority.High, responseTimeMinutes: 30, resolutionTimeMinutes: 240 } }),
    [TicketPriority.Medium]: await prisma.slaPolicy.create({ data: { name: 'Medium SLA', priority: TicketPriority.Medium, responseTimeMinutes: 60, resolutionTimeMinutes: 480 } }),
    [TicketPriority.Low]: await prisma.slaPolicy.create({ data: { name: 'Low SLA', priority: TicketPriority.Low, responseTimeMinutes: 120, resolutionTimeMinutes: 1440 } }),
  };

  // ---------------------------------------------------------------------
  // Knowledge base
  // ---------------------------------------------------------------------
  const gettingStarted = await prisma.knowledgeBaseCategory.create({ data: { name: 'Getting Started' } });
  const troubleshooting = await prisma.knowledgeBaseCategory.create({ data: { name: 'Troubleshooting' } });

  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: troubleshooting.id,
      authorId: agent1.id,
      title: 'How to Reset Your Password',
      slug: 'how-to-reset-your-password',
      content: 'If you have forgotten your password, contact the service desk to request a reset link. For security, resets require verifying your identity with your manager.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(60),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: gettingStarted.id,
      authorId: agent2.id,
      title: 'Setting Up Your New Laptop',
      slug: 'setting-up-your-new-laptop',
      content: 'New laptops are pre-imaged with the standard OpsNow software bundle. On first boot, sign in with your company account and allow the setup wizard to finish syncing.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(45),
    },
  });
  const vpnArticle = await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: troubleshooting.id,
      authorId: agent1.id,
      title: 'VPN Connection Issues',
      slug: 'vpn-connection-issues',
      content: 'Draft notes: check split-tunnel config and client version before escalating. Most drops are caused by an outdated VPN client.',
      status: KnowledgeArticleStatus.Draft,
    },
  });

  // ---------------------------------------------------------------------
  // Tickets — a realistic spread of priorities/statuses
  // ---------------------------------------------------------------------

  // Ticket 1: High priority, in progress, agent has responded, within SLA.
  const ticket1 = await prisma.ticket.create({
    data: {
      subject: "Laptop won't turn on",
      description: 'My laptop (asset tag LAPTOP-0001) will not power on this morning. The charging light is off too.',
      requesterId: employee1.id,
      assigneeId: agent1.id,
      categoryId: laptopCategory.id,
      priority: TicketPriority.High,
      status: TicketStatus.InProgress,
      createdAt: hoursAgo(3),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket1.id,
      slaPolicyId: slaByPriority.High.id,
      responseTargetMinutes: slaByPriority.High.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.High.resolutionTimeMinutes,
      responseDueAt: new Date(hoursAgo(3).getTime() + slaByPriority.High.responseTimeMinutes * 60 * 1000),
      responseAt: hoursAgo(2.6),
      resolutionDueAt: new Date(hoursAgo(3).getTime() + slaByPriority.High.resolutionTimeMinutes * 60 * 1000),
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket1.id, actorId: employee1.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: hoursAgo(3) },
      { ticketId: ticket1.id, actorId: teamLead.id, fieldName: 'assignee_id', oldValue: null, newValue: agent1.id, createdAt: hoursAgo(2.8) },
      { ticketId: ticket1.id, actorId: agent1.id, fieldName: 'status', oldValue: 'New', newValue: 'InProgress', createdAt: hoursAgo(2.5) },
    ],
  });
  await prisma.ticketComment.create({
    data: { ticketId: ticket1.id, authorId: employee1.id, body: 'Tried a different power outlet, still nothing.', visibility: CommentVisibility.Public, createdAt: hoursAgo(2.9) },
  });
  await prisma.ticketComment.create({
    data: { ticketId: ticket1.id, authorId: agent1.id, body: 'Likely a dead charger brick — bringing a loaner to swap and test.', visibility: CommentVisibility.Internal, createdAt: hoursAgo(2.4) },
  });
  await prisma.ticketAsset.create({ data: { ticketId: ticket1.id, assetId: laptop1.id, linkedById: agent1.id } });
  await prisma.notification.create({
    data: { recipientId: agent1.id, type: NotificationType.TicketAssigned, title: `Ticket #${ticket1.ticketNumber} assigned to you`, ticketId: ticket1.id, createdAt: hoursAgo(2.8) },
  });

  // Ticket 2: Medium priority, resolved within SLA.
  const ticket2 = await prisma.ticket.create({
    data: {
      subject: 'Need access to Finance shared drive',
      description: 'I was moved to the Finance team last week and still cannot open the shared drive.',
      requesterId: employee2.id,
      assigneeId: agent2.id,
      categoryId: accessRequest.id,
      priority: TicketPriority.Medium,
      status: TicketStatus.Resolved,
      resolvedAt: new Date(daysAgo(5).getTime() + 5 * HOUR),
      createdAt: daysAgo(5),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket2.id,
      slaPolicyId: slaByPriority.Medium.id,
      responseTargetMinutes: slaByPriority.Medium.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Medium.resolutionTimeMinutes,
      responseDueAt: new Date(daysAgo(5).getTime() + slaByPriority.Medium.responseTimeMinutes * 60 * 1000),
      responseAt: new Date(daysAgo(5).getTime() + 40 * 60 * 1000),
      resolutionDueAt: new Date(daysAgo(5).getTime() + slaByPriority.Medium.resolutionTimeMinutes * 60 * 1000),
      resolutionBreached: false,
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket2.id, actorId: employee2.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: daysAgo(5) },
      { ticketId: ticket2.id, actorId: agent2.id, fieldName: 'status', oldValue: 'New', newValue: 'Resolved', createdAt: new Date(daysAgo(5).getTime() + 5 * HOUR) },
    ],
  });
  await prisma.notification.create({
    data: { recipientId: agent2.id, type: NotificationType.TicketAssigned, title: `Ticket #${ticket2.ticketNumber} assigned to you`, ticketId: ticket2.id, readAt: daysAgo(4), createdAt: daysAgo(5) },
  });

  // Ticket 3: Low priority, brand new, unassigned.
  const ticket3 = await prisma.ticket.create({
    data: {
      subject: 'Outlook keeps crashing',
      description: 'Outlook crashes a few minutes after opening it, every time.',
      requesterId: employee3.id,
      categoryId: businessApps.id,
      priority: TicketPriority.Low,
      status: TicketStatus.New,
      createdAt: hoursAgo(1),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket3.id,
      slaPolicyId: slaByPriority.Low.id,
      responseTargetMinutes: slaByPriority.Low.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Low.resolutionTimeMinutes,
      responseDueAt: new Date(hoursAgo(1).getTime() + slaByPriority.Low.responseTimeMinutes * 60 * 1000),
      resolutionDueAt: new Date(hoursAgo(1).getTime() + slaByPriority.Low.resolutionTimeMinutes * 60 * 1000),
    },
  });
  await prisma.ticketHistory.create({
    data: { ticketId: ticket3.id, actorId: employee3.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: hoursAgo(1) },
  });

  // Ticket 4: Critical priority, on hold, approaching SLA breach.
  const ticket4 = await prisma.ticket.create({
    data: {
      subject: 'VPN drops every 10 minutes',
      description: 'VPN disconnects repeatedly, making remote work almost impossible today.',
      requesterId: employee1.id,
      assigneeId: agent1.id,
      categoryId: network.id,
      priority: TicketPriority.Critical,
      status: TicketStatus.OnHold,
      createdAt: hoursAgo(6),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket4.id,
      slaPolicyId: slaByPriority.Critical.id,
      responseTargetMinutes: slaByPriority.Critical.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Critical.resolutionTimeMinutes,
      responseDueAt: new Date(hoursAgo(6).getTime() + slaByPriority.Critical.responseTimeMinutes * 60 * 1000),
      responseAt: hoursAgo(5.8),
      resolutionDueAt: new Date(hoursAgo(6).getTime() + slaByPriority.Critical.resolutionTimeMinutes * 60 * 1000),
      resolutionBreached: true,
      onHoldStartedAt: hoursAgo(1),
      totalPausedMinutes: 0,
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket4.id, actorId: employee1.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: hoursAgo(6) },
      { ticketId: ticket4.id, actorId: agent1.id, fieldName: 'status', oldValue: 'New', newValue: 'InProgress', createdAt: hoursAgo(5.8) },
      { ticketId: ticket4.id, actorId: agent1.id, fieldName: 'status', oldValue: 'InProgress', newValue: 'OnHold', createdAt: hoursAgo(1) },
    ],
  });
  await prisma.ticketKnowledgeArticle.create({ data: { ticketId: ticket4.id, articleId: vpnArticle.id, linkedById: agent1.id } });
  await prisma.notification.create({
    data: { recipientId: agent1.id, type: NotificationType.SLABreached, title: `Ticket #${ticket4.ticketNumber} has breached its resolution SLA`, ticketId: ticket4.id, createdAt: hoursAgo(1) },
  });

  // Ticket 5: reopened ticket — demonstrates reopened_count and history, per
  // the Phase 2 decision that reopening does NOT create a new SLA cycle.
  const ticket5 = await prisma.ticket.create({
    data: {
      subject: 'Printer not working',
      description: 'The 3rd floor printer is jammed and now shows an error code.',
      requesterId: employee2.id,
      assigneeId: agent2.id,
      categoryId: hardware.id,
      priority: TicketPriority.Medium,
      status: TicketStatus.Open,
      reopenedCount: 1,
      createdAt: daysAgo(10),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket5.id,
      slaPolicyId: slaByPriority.Medium.id,
      responseTargetMinutes: slaByPriority.Medium.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Medium.resolutionTimeMinutes,
      responseDueAt: new Date(daysAgo(10).getTime() + slaByPriority.Medium.responseTimeMinutes * 60 * 1000),
      responseAt: new Date(daysAgo(10).getTime() + 20 * 60 * 1000),
      resolutionDueAt: new Date(daysAgo(10).getTime() + slaByPriority.Medium.resolutionTimeMinutes * 60 * 1000),
      resolutionBreached: true,
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket5.id, actorId: employee2.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: daysAgo(10) },
      { ticketId: ticket5.id, actorId: agent2.id, fieldName: 'status', oldValue: 'New', newValue: 'InProgress', createdAt: daysAgo(9) },
      { ticketId: ticket5.id, actorId: agent2.id, fieldName: 'status', oldValue: 'InProgress', newValue: 'Resolved', createdAt: daysAgo(8) },
      { ticketId: ticket5.id, actorId: employee2.id, fieldName: 'status', oldValue: 'Resolved', newValue: 'Open', createdAt: daysAgo(1) },
      { ticketId: ticket5.id, actorId: employee2.id, fieldName: 'reopened_count', oldValue: '0', newValue: '1', createdAt: daysAgo(1) },
    ],
  });
  await prisma.ticketComment.create({
    data: { ticketId: ticket5.id, authorId: employee2.id, body: 'This jammed again in the exact same spot — reopening.', visibility: CommentVisibility.Public, createdAt: daysAgo(1) },
  });

  console.log('Seed complete:', {
    users: 7,
    ticketCategories: 8,
    assetTypes: 6,
    assets: 5,
    slaPolicies: 4,
    knowledgeBaseArticles: 3,
    tickets: 5,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
