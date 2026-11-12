const careLead = 'A Daughter Reads for Her Father\nA tender story about caring for her father.';
const crewLead = 'A Student Makes a Case for a Ramp\nA story of a student rallying support to make the old hall accessible.';
const manuscript = 'On the phone, Ahe read the hearing-aid instructions aloud for her father. Ten minutes later, she was outside the hall collecting signatures for an access ramp.';

export function takeTheLightLesson(editLede) {
  return {
    id: 'take-the-light',
    version: '1.0.0',
    title: '今晚谁来接灯？',
    steps: [
      {
        id: 'night-reading',
        type: 'briefing',
        title: '18:40，谁在礼堂？',
        config: {
          body: '18:40，林岑同时被排进礼堂试灯和夜读会。夜读会编辑在节目单上用了她那篇短篇的一条推荐语，林岑被安排到「家庭故事」专场。她问：“你看过我的全文吗？”\n\n你接手校对节目单。桌上有一段原稿，你要从中选一个细节，写进节目单的推荐语。',
          prompt: 'What would you expect to read in a session called “Family Stories”?',
        },
        teacher: {
          note: '0–1 分钟。让学生预测“家庭故事”栏目可能出现什么。强调林岑是作者，原稿中的阿禾是主人公。下一页请学生自己读原稿。',
        },
      },
      {
        ...editLede,
        teacher: {
          note: '1–3 分钟。请同学读两句原稿，任选一个细节试排节目单。鼓励先看一版，再换另一句看看标题和导语会怎样变。每人选一版提交。确认已收份数后锁定、揭晓，再进下一环节。此轮两种选择都有原文依据。',
        },
      },
      {
        id: 'compare-leads',
        type: 'discussion',
        title: '同一篇稿，两条推荐语',
        sourceStepId: 'edit-lede',
        fallback: '请用这两条课堂示例继续。第一条用了读助听器说明的细节，第二条用了征集无障碍坡道签名的细节。',
        config: {
          body: `${careLead}\n\n${crewLead}\n\n原稿\n${manuscript}\n\n翻到 Reading 2 p.103 第 1 段。圈出 But，找出它前后各发生了什么。`,
          prompt: 'The first lead foregrounds … . The second foregrounds … . In paragraph 1, what changed for women novelists, and what ideas about their writing took hold?',
        },
        teacher: {
          note: '3–6 分钟。左半班先看一条推荐语，预测这篇短篇的主题。右半班用原稿指出推荐语漏掉的细节，然后交换。用 “This lead foregrounds … by citing …” 找证据。回 p.103 ¶1：But 前是 Jane Austen、Brontë 姐妹等女作家成名；But 后是当时形成了关于女作家及其题材的狭窄观念。可以追问节目安排怎样受推荐语影响，再让学生说出作者、评论者和编排者各做了什么。投票只反映本轮选择。',
        },
      },
      {
        id: 'review-unit',
        type: 'activity',
        module: 'choice@1',
        title: '10,287，数的是什么？',
        config: {
          body: '节目单让我们看见谁入选和谁被怎样介绍。Reading 2 p.104 第 3 段里，研究者检查了自 2000 年以来发表的一批材料，并分析其中的措辞。',
          prompt: 'What did the researchers collect 10,287 of?',
          options: [
            { id: 'books', label: 'Books written by the authors under review' },
            { id: 'listings', label: 'Entries in book review periodical tables of contents' },
            { id: 'reviews', label: 'Published book reviews' },
          ],
        },
        teacher: {
          note: '6–8 分钟。请学生先翻书定位，再提交。锁定揭晓后，一人读 “10,287 reviews”，另一人指出研究对每篇书评标注了谁的性别。用 Who reviewed whose book? 检查两个角色是否分清。',
          correctOptionId: 'reviews',
          explanation: '10,287 是已发表的书评篇数。研究者标注书评者和受评作者的性别，再分析书评里的用词。',
        },
      },
      {
        id: 'exit-line',
        type: 'briefing',
        title: '离场前，交一句英文',
        config: {
          body: '和同桌选一句说完整，再互换。第一句要指出原稿中的具体动作。第二句要说明研究语料与研究者比较的内容。',
          prompt: 'This lead foregrounds … by citing … .\n\nThe researchers examined … and compared … .',
        },
        teacher: {
          note: '8–9 分钟。请两位同学各读一句。例答：“This lead foregrounds public action by citing Ahe’s collection of signatures for an access ramp.” “The researchers examined 10,287 published reviews and compared the reviewers’ language.”',
        },
      },
    ],
  };
}
