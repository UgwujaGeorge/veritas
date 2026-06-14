// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Veritas is ReentrancyGuard {
    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved,
        Rejected
    }

    struct Milestone {
        string title;
        string criteria;
        string evidenceUrl;
        uint256 amount;
        MilestoneStatus status;
        uint256 resubmissionCount;
    }

    struct Grant {
        address issuer;
        address grantee;
        string title;
        uint256 totalAmount;
        Milestone[] milestones;
        bool active;
    }

    mapping(uint256 => Grant) public grants;
    uint256 public grantCount;
    address public owner;

    event GrantCreated(
        uint256 indexed grantId,
        address indexed issuer,
        address indexed grantee,
        string title,
        uint256 totalAmount
    );
    event EvidenceSubmitted(uint256 indexed grantId, uint256 milestoneIndex, string evidenceUrl, uint256 attemptNumber);
    event MilestoneApproved(uint256 indexed grantId, uint256 milestoneIndex, uint256 amount);
    event MilestoneRejected(uint256 indexed grantId, uint256 milestoneIndex);

    error NotOwner();
    error GrantDoesNotExist();
    error MilestoneDoesNotExist();
    error EmptyMilestones();
    error ArrayLengthMismatch();
    error IncorrectEscrowAmount();
    error InvalidGrantee();
    error OnlyGrantee();
    error MilestoneNotSubmittable();
    error MilestoneNotSubmitted();
    error EmptyEvidenceUrl();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert NotOwner();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createGrant(
        string calldata title,
        address grantee,
        string[] calldata milestoneTitles,
        string[] calldata milestoneCriteria,
        uint256[] calldata milestoneAmounts
    ) external payable returns (uint256 grantId) {
        uint256 milestoneCount = milestoneTitles.length;
        if (grantee == address(0)) {
            revert InvalidGrantee();
        }
        if (milestoneCount == 0) {
            revert EmptyMilestones();
        }
        if (milestoneCount != milestoneCriteria.length || milestoneCount != milestoneAmounts.length) {
            revert ArrayLengthMismatch();
        }

        uint256 totalAmount;
        for (uint256 i = 0; i < milestoneCount; i++) {
            totalAmount += milestoneAmounts[i];
        }
        if (msg.value != totalAmount) {
            revert IncorrectEscrowAmount();
        }

        grantId = grantCount;
        Grant storage grant = grants[grantId];
        grant.issuer = msg.sender;
        grant.grantee = grantee;
        grant.title = title;
        grant.totalAmount = totalAmount;
        grant.active = true;

        for (uint256 i = 0; i < milestoneCount; i++) {
            grant.milestones.push(
                Milestone({
                    title: milestoneTitles[i],
                    criteria: milestoneCriteria[i],
                    evidenceUrl: "",
                    amount: milestoneAmounts[i],
                    status: MilestoneStatus.Pending,
                    resubmissionCount: 0
                })
            );
        }

        grantCount++;
        emit GrantCreated(grantId, msg.sender, grantee, title, totalAmount);
    }

    function submitEvidence(uint256 grantId, uint256 milestoneIndex, string calldata evidenceUrl) external {
        Grant storage grant = _grant(grantId);
        Milestone storage milestone = _milestone(grant, milestoneIndex);

        if (msg.sender != grant.grantee) {
            revert OnlyGrantee();
        }
        if (milestone.status == MilestoneStatus.Rejected) {
            milestone.resubmissionCount++;
        } else if (milestone.status != MilestoneStatus.Pending) {
            revert MilestoneNotSubmittable();
        }
        if (bytes(evidenceUrl).length == 0) {
            revert EmptyEvidenceUrl();
        }

        milestone.evidenceUrl = evidenceUrl;
        milestone.status = MilestoneStatus.Submitted;

        emit EvidenceSubmitted(grantId, milestoneIndex, evidenceUrl, milestone.resubmissionCount + 1);
    }

    function recordVerdict(uint256 grantId, uint256 milestoneIndex, bool approved) external onlyOwner nonReentrant {
        Grant storage grant = _grant(grantId);
        Milestone storage milestone = _milestone(grant, milestoneIndex);

        if (milestone.status != MilestoneStatus.Submitted) {
            revert MilestoneNotSubmitted();
        }

        if (approved) {
            milestone.status = MilestoneStatus.Approved;
            (bool ok,) = payable(grant.grantee).call{value: milestone.amount}("");
            if (!ok) {
                revert TransferFailed();
            }
            emit MilestoneApproved(grantId, milestoneIndex, milestone.amount);
        } else {
            milestone.status = MilestoneStatus.Rejected;
            emit MilestoneRejected(grantId, milestoneIndex);
        }
    }

    function getGrant(uint256 grantId) external view returns (Grant memory) {
        if (grantId >= grantCount) {
            revert GrantDoesNotExist();
        }
        return grants[grantId];
    }

    function getMilestone(uint256 grantId, uint256 milestoneIndex) external view returns (Milestone memory) {
        if (grantId >= grantCount) {
            revert GrantDoesNotExist();
        }
        Grant storage grant = grants[grantId];
        if (milestoneIndex >= grant.milestones.length) {
            revert MilestoneDoesNotExist();
        }
        return grant.milestones[milestoneIndex];
    }

    function getGrantCount() external view returns (uint256) {
        return grantCount;
    }

    function _grant(uint256 grantId) private view returns (Grant storage grant) {
        if (grantId >= grantCount) {
            revert GrantDoesNotExist();
        }
        grant = grants[grantId];
    }

    function _milestone(Grant storage grant, uint256 milestoneIndex) private view returns (Milestone storage milestone) {
        if (milestoneIndex >= grant.milestones.length) {
            revert MilestoneDoesNotExist();
        }
        milestone = grant.milestones[milestoneIndex];
    }
}
