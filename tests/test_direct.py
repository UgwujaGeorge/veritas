import json


def test_evaluate_milestone_approved(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.mock_web(
        r"github\.com/testuser",
        {"status": 200, "body": "Repository includes a deployed Base Sepolia contract at 0x123."},
    )
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": true, "confidence": 82, "evidence_summary": "A deployed contract address is present.", "reasoning": "The evidence includes a deployed contract address."}',
    )

    direct_vm.sender = direct_alice
    result = contract.evaluate_milestone(
        "https://github.com/testuser/veritas",
        "Evidence must show a deployed contract address.",
    )

    verdict = json.loads(result)
    assert verdict["approved"] is True
    assert verdict["confidence"] == 82
    assert "deployed contract" in verdict["reasoning"]


def test_evaluate_milestone_rejected(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.mock_web(r".*", {"status": 200, "body": "A README with no deployment details."})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": false, "confidence": 88, "evidence_summary": "No deployment details are present.", "reasoning": "The evidence does not show a deployment."}',
    )

    direct_vm.sender = direct_alice
    result = contract.evaluate_milestone(
        "https://github.com/testuser/incomplete",
        "Evidence must show a deployed contract address.",
    )

    verdict = json.loads(result)
    assert verdict["approved"] is False
    assert verdict["confidence"] == 88


def test_evaluate_milestone_low_confidence_approval_is_rejected(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.mock_web(r".*", {"status": 200, "body": "A vague README with partial deployment notes."})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": true, "confidence": 40, "evidence_summary": "Deployment evidence is weak.", "reasoning": "The evidence is too ambiguous to approve."}',
    )

    direct_vm.sender = direct_alice
    result = contract.evaluate_milestone(
        "https://github.com/testuser/vague",
        "Evidence must show a deployed contract address.",
    )

    verdict = json.loads(result)
    assert verdict["approved"] is False
    assert verdict["confidence"] == 40


def test_validator_accepts_same_decision_with_different_reasoning(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.mock_web(r".*", {"status": 200, "body": "Repository includes a deployed Base Sepolia contract at 0x123."})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": true, "confidence": 80, "evidence_summary": "Deployment found.", "reasoning": "The contract address satisfies the criteria."}',
    )

    direct_vm.sender = direct_alice
    contract.evaluate_milestone(
        "https://github.com/testuser/veritas",
        "Evidence must show a deployed contract address.",
    )

    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "Repository includes a deployed Base Sepolia contract at 0x123."})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": true, "confidence": 62, "evidence_summary": "Address found.", "reasoning": "The submitted page reasonably proves deployment."}',
    )

    assert direct_vm.run_validator() is True


def test_validator_rejects_changed_approval_decision(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.mock_web(r".*", {"status": 200, "body": "Repository includes a deployed Base Sepolia contract at 0x123."})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": true, "confidence": 80, "evidence_summary": "Deployment found.", "reasoning": "The contract address satisfies the criteria."}',
    )

    direct_vm.sender = direct_alice
    contract.evaluate_milestone(
        "https://github.com/testuser/veritas",
        "Evidence must show a deployed contract address.",
    )

    direct_vm.clear_mocks()
    direct_vm.mock_web(r".*", {"status": 200, "body": "Repository includes a deployed Base Sepolia contract at 0x123."})
    direct_vm.mock_llm(
        r"grant milestone verifier",
        '{"approved": false, "confidence": 90, "evidence_summary": "No deployment found.", "reasoning": "The validator disagrees with approval."}',
    )

    assert direct_vm.run_validator() is False


def test_evaluate_milestone_requires_evidence_url(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Evidence URL is required"):
        contract.evaluate_milestone("", "Evidence must show a deployment.")


def test_evaluate_milestone_requires_criteria(direct_deploy, direct_alice, direct_vm):
    contract = direct_deploy("contracts/veritas.py")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Criteria is required"):
        contract.evaluate_milestone("https://example.com/evidence", "")
