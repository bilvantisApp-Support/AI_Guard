import mongoose from 'mongoose';
import { Project } from '../../../../src/database/models/project.model';
import { User } from '../../../../src/database/models/user.model';
import { projectRepository } from '../../../../src/database/repositories/project.repository';


require('dotenv').config();

describe('ProjectRepository.findByIdWithMembers', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI!);
  });

  afterAll(async () => {
    await mongoose.disconnect();
  });

  it('populates members.userId with name and email', async () => {
    const user = await User.create({
      name: 'John',
      email: 'john@test.com',
    });

    const project = await Project.create({
      name: 'Proj',
      ownerId: user._id,
      members: [{
        userId: user._id,
        role: 'owner',
        addedAt: new Date(),
      }],
    });

    const result = await projectRepository.findByIdWithMembers(project._id);

    expect(result!.members[0].userId).toMatchObject({
      name: 'John',
      email: 'john@test.com',
    });
  });
});
