export const veritasAbi = [
  {
    type: 'function',
    name: 'createGrant',
    stateMutability: 'payable',
    inputs: [
      { name: 'title', type: 'string' },
      { name: 'grantee', type: 'address' },
      { name: 'milestoneTitles', type: 'string[]' },
      { name: 'milestoneCriteria', type: 'string[]' },
      { name: 'milestoneAmounts', type: 'uint256[]' },
    ],
    outputs: [{ name: 'grantId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'submitEvidence',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'grantId', type: 'uint256' },
      { name: 'milestoneIndex', type: 'uint256' },
      { name: 'evidenceUrl', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'recordVerdict',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'grantId', type: 'uint256' },
      { name: 'milestoneIndex', type: 'uint256' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getGrant',
    stateMutability: 'view',
    inputs: [{ name: 'grantId', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'issuer', type: 'address' },
          { name: 'grantee', type: 'address' },
          { name: 'title', type: 'string' },
          { name: 'totalAmount', type: 'uint256' },
          {
            name: 'milestones',
            type: 'tuple[]',
            components: [
              { name: 'title', type: 'string' },
              { name: 'criteria', type: 'string' },
              { name: 'evidenceUrl', type: 'string' },
              { name: 'amount', type: 'uint256' },
              { name: 'status', type: 'uint8' },
              { name: 'resubmissionCount', type: 'uint256' },
            ],
          },
          { name: 'active', type: 'bool' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getMilestone',
    stateMutability: 'view',
    inputs: [
      { name: 'grantId', type: 'uint256' },
      { name: 'milestoneIndex', type: 'uint256' },
    ],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'title', type: 'string' },
          { name: 'criteria', type: 'string' },
          { name: 'evidenceUrl', type: 'string' },
          { name: 'amount', type: 'uint256' },
          { name: 'status', type: 'uint8' },
          { name: 'resubmissionCount', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'getGrantCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'GrantCreated',
    inputs: [
      { name: 'grantId', type: 'uint256', indexed: true },
      { name: 'issuer', type: 'address', indexed: true },
      { name: 'grantee', type: 'address', indexed: true },
      { name: 'title', type: 'string', indexed: false },
      { name: 'totalAmount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'EvidenceSubmitted',
    inputs: [
      { name: 'grantId', type: 'uint256', indexed: true },
      { name: 'milestoneIndex', type: 'uint256', indexed: false },
      { name: 'evidenceUrl', type: 'string', indexed: false },
      { name: 'attemptNumber', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MilestoneApproved',
    inputs: [
      { name: 'grantId', type: 'uint256', indexed: true },
      { name: 'milestoneIndex', type: 'uint256', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
  {
    type: 'event',
    name: 'MilestoneRejected',
    inputs: [
      { name: 'grantId', type: 'uint256', indexed: true },
      { name: 'milestoneIndex', type: 'uint256', indexed: false },
    ],
    anonymous: false,
  },
] as const;
