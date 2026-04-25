import { StoriesService } from './stories.service'

describe('StoriesService screenplay behavior', () => {
  const createService = () => {
    const prisma = {} as any;
    const passagesService = {} as any;
    return new StoriesService(prisma, passagesService);
  };

  it('bundles character cue and dialogue into a screenplay turn block', () => {
    const service = createService() as any;

    const doc = {
      type: 'doc',
      content: [
        {
          type: 'sceneHeading',
          content: [{ type: 'text', text: 'INT. APARTMENT - NIGHT' }],
        },
        {
          type: 'characterCue',
          content: [{ type: 'text', text: 'JEREMIAH' }],
        },
        {
          type: 'dialogue',
          content: [{ type: 'text', text: 'We need to move now.' }],
        },
      ],
    };

    const blocks = service.splitStoryDocument(doc, undefined, 'screenplay');

    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('screenplay_scene_heading');
    expect(blocks[1].type).toBe('screenplay_turn');
  });

  it('infers a character reference from screenplay character cue text', () => {
    const service = createService() as any;

    const candidates = service.extractScreenplaySpeakerCandidates(
      {
        type: 'doc',
        content: [
          {
            type: 'characterCue',
            content: [{ type: 'text', text: 'JEREMIAH DAVIS' }],
          },
        ],
      },
      [
        {
          id: 'char_1',
          name: 'Jeremiah Davis',
          color: 'purple',
          aliases: [],
        },
      ],
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      entityId: 'char_1',
      entityType: 'character',
      source: 'inferred',
    });
  });
});
